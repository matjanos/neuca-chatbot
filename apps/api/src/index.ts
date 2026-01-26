import './telemetry.js';

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import pino from 'pino';
import { SERVER_CONFIG, MODEL_CONFIG } from './config.js';
import type { CompletionRequest, CompletionResponse } from './types.js';
import { processMessage, processMessageStream, prepareRAGContext } from './agent/lecture-qa.js';
import { checkConnection, getCollectionStats } from './services/qdrant.js';
import * as memory from './services/memory.js';
import { analyzePII } from './services/presidio.js';

const tracer = trace.getTracer('api');

// Setup Pino structured logger
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
});

// Stream error codes for classification
enum StreamErrorCode {
  OPENAI_RATE_LIMIT = 'openai_rate_limit',
  OPENAI_TIMEOUT = 'openai_timeout',
  OPENAI_API_ERROR = 'openai_api_error',
  QDRANT_CONNECTION = 'qdrant_connection',
  QDRANT_TIMEOUT = 'qdrant_timeout',
  EMBEDDING_GENERATION = 'embedding_generation',
  STREAM_TIMEOUT = 'stream_timeout',
  INTERNAL_ERROR = 'internal_error',
}

// Polish error messages for each error code
const POLISH_ERROR_MESSAGES: Record<StreamErrorCode, string> = {
  [StreamErrorCode.OPENAI_RATE_LIMIT]:
    'Przekroczono limit zapytań. Proszę spróbować za chwilę.',
  [StreamErrorCode.QDRANT_CONNECTION]:
    'Błąd połączenia z bazą wiedzy. Skontaktuj się z administratorem.',
  [StreamErrorCode.EMBEDDING_GENERATION]:
    'Nie udało się przetworzyć pytania. Spróbuj ponownie.',
  [StreamErrorCode.STREAM_TIMEOUT]:
    'Przekroczono czas oczekiwania. Spróbuj ponownie.',
  [StreamErrorCode.OPENAI_TIMEOUT]:
    'Przekroczono czas oczekiwania odpowiedzi. Spróbuj ponownie.',
  [StreamErrorCode.OPENAI_API_ERROR]:
    'Błąd API OpenAI. Spróbuj ponownie za chwilę.',
  [StreamErrorCode.QDRANT_TIMEOUT]:
    'Przekroczono czas oczekiwania bazy wiedzy. Spróbuj ponownie.',
  [StreamErrorCode.INTERNAL_ERROR]:
    'Wystąpił błąd serwera. Spróbuj ponownie za chwilę.',
};

/**
 * Classify error into known error codes
 */
function classifyError(error: Error): StreamErrorCode {
  const msg = error.message.toLowerCase();

  if (msg.includes('rate limit') || msg.includes('429')) return StreamErrorCode.OPENAI_RATE_LIMIT;
  if (msg.includes('econnrefused') || msg.includes('qdrant')) return StreamErrorCode.QDRANT_CONNECTION;
  if (msg.includes('timeout') && msg.includes('qdrant')) return StreamErrorCode.QDRANT_TIMEOUT;
  if (msg.includes('timeout') && (msg.includes('openai') || msg.includes('stream'))) return StreamErrorCode.OPENAI_TIMEOUT;
  if (msg.includes('timeout')) return StreamErrorCode.STREAM_TIMEOUT;
  if (msg.includes('embedding')) return StreamErrorCode.EMBEDDING_GENERATION;
  if (msg.includes('openai') || msg.includes('api')) return StreamErrorCode.OPENAI_API_ERROR;

  return StreamErrorCode.INTERNAL_ERROR;
}

/**
 * Check if an error is retryable
 */
function isRetryableError(code: StreamErrorCode): boolean {
  return [
    StreamErrorCode.OPENAI_TIMEOUT,
    StreamErrorCode.QDRANT_TIMEOUT,
    StreamErrorCode.STREAM_TIMEOUT,
    StreamErrorCode.OPENAI_RATE_LIMIT,
  ].includes(code);
}

/**
 * Get Polish error message for error code
 */
function getPolishErrorMessage(code: StreamErrorCode): string {
  return POLISH_ERROR_MESSAGES[code] || POLISH_ERROR_MESSAGES[StreamErrorCode.INTERNAL_ERROR];
}

/**
 * Create an SSE error stream response (instead of JSON 500)
 * This ensures that errors after streaming starts are still sent as SSE events
 */
function createErrorStream(
  error: Error,
  requestId: string,
  traceId: string
): Response {
  const errorCode = classifyError(error);
  const userMessage = getPolishErrorMessage(errorCode);

  logger.error({
    operation: 'stream.error',
    requestId,
    traceId,
    error: {
      message: error.message,
      code: errorCode,
      stack: error.stack,
    },
  }, 'Stream failed');

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // Send SSE format error events
      controller.enqueue(encoder.encode('data: {"type":"start"}\n\n'));
      controller.enqueue(encoder.encode('data: {"type":"start-step"}\n\n'));

      const textId = `error-${Date.now()}`;
      controller.enqueue(encoder.encode(`data: {"type":"text-start","id":"${textId}"}\n\n`));
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
        type: 'text-delta',
        id: textId,
        delta: userMessage,
      })}\n\n`));
      controller.enqueue(encoder.encode(`data: {"type":"text-end","id":"${textId}"}\n\n`));

      controller.enqueue(encoder.encode('data: {"type":"finish-step"}\n\n'));
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
        type: 'error',
        error: {
          code: errorCode,
          message: userMessage,
          retryable: isRetryableError(errorCode),
        },
      })}\n\n`));
      controller.enqueue(encoder.encode('data: {"type":"finish"}\n\n'));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Request-Id': requestId,
      'X-Trace-Id': traceId,
    },
  });
}

/**
 * Create monitored stream with heartbeat and timeout detection
 * Properly handles errors by sending SSE error events before closing
 */
function createMonitoredStream(
  result: ReturnType<typeof streamText>,
  requestId: string,
  traceId: string,
  streamLogger: pino.Logger
): Response {
  // Use shorter heartbeat interval to prevent connection timeout during OpenAI reasoning
  // Many proxies/browsers have ~10-30 second idle timeouts
  const HEARTBEAT_INTERVAL = 5000; // 5s - more aggressive to prevent idle timeouts
  const TIMEOUT_THRESHOLD = 60000; // 60s - increase timeout for reasoning models

  let lastActivity = Date.now();
  let heartbeatTimer: Timer;

  // Try to create the UI message stream response
  let originalResponse;
  let reader;
  try {
    originalResponse = result.toUIMessageStreamResponse({ sendReasoning: true });
    if (!originalResponse.body) {
      throw new Error('Response body is null');
    }
    reader = originalResponse.body.getReader();
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    streamLogger.error({
      operation: 'stream.ui_response_creation.failed',
      requestId,
      traceId,
      error: { message: err.message, name: err.name, stack: err.stack },
    }, 'Failed to create UI message stream response');
    throw err;
  }

  const encoder = new TextEncoder();

  /**
   * Send error event as SSE and close stream gracefully
   */
  function sendErrorAndClose(controller: ReadableStreamDefaultController, error: Error, errorCode: StreamErrorCode) {
    const userMessage = getPolishErrorMessage(errorCode);

    // Send error events in SSE format
    const textId = `error-${Date.now()}`;
    try {
      controller.enqueue(encoder.encode(`data: {"type":"text-start","id":"${textId}"}\n\n`));
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
        type: 'text-delta',
        id: textId,
        delta: userMessage,
      })}\n\n`));
      controller.enqueue(encoder.encode(`data: {"type":"text-end","id":"${textId}"}\n\n`));
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
        type: 'error',
        error: {
          code: errorCode,
          message: userMessage,
          retryable: isRetryableError(errorCode),
        },
      })}\n\n`));
      controller.enqueue(encoder.encode('data: {"type":"finish"}\n\n'));
    } catch (enqueueError) {
      // Controller might be closed, log but don't throw
      streamLogger.error({
        operation: 'stream.error_enqueue_failed',
        requestId,
        error: { message: String(enqueueError) },
      }, 'Failed to enqueue error event');
    }

    // Close gracefully
    try {
      controller.close();
    } catch (closeError) {
      // Already closed, ignore
    }
  }

  // Track if stream was cancelled to avoid writing to closed controller
  let isCancelled = false;

  const monitoredStream = new ReadableStream({
    async start(controller) {
      // CRITICAL: Send immediate keep-alive to establish data flow
      // This prevents timeout/cancel when OpenAI is slow to respond (reasoning models)
      // Without this, the connection stays idle and may be terminated by browser/network layer
      try {
        controller.enqueue(encoder.encode(': stream-connected\n\n'));
        streamLogger.debug({
          operation: 'stream.initial_keepalive',
          requestId,
          traceId,
        }, 'Sent initial keep-alive');
      } catch (err) {
        streamLogger.error({
          operation: 'stream.initial_keepalive_failed',
          requestId,
          error: { message: String(err) },
        }, 'Failed to send initial keep-alive');
      }

      heartbeatTimer = setInterval(() => {
        // Don't do anything if stream was cancelled
        if (isCancelled) {
          clearInterval(heartbeatTimer);
          return;
        }

        const elapsed = Date.now() - lastActivity;

        if (elapsed > TIMEOUT_THRESHOLD) {
          streamLogger.error({
            operation: 'stream.timeout',
            requestId,
            traceId,
            durationMs: elapsed,
          }, 'Stream timeout detected');

          clearInterval(heartbeatTimer);
          const timeoutError = new Error('Stream timeout - no data received for 60 seconds');
          sendErrorAndClose(controller, timeoutError, StreamErrorCode.STREAM_TIMEOUT);
          return;
        }

        // Send SSE comment as heartbeat (keep connection alive)
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch (heartbeatError) {
          // Stream might be closed, clear interval
          clearInterval(heartbeatTimer);
        }
      }, HEARTBEAT_INTERVAL);

      try {
        while (true) {
          // Check if cancelled before reading
          if (isCancelled) {
            streamLogger.debug({
              operation: 'stream.cancelled_during_read',
              requestId,
              traceId,
            }, 'Stream reading stopped due to cancellation');
            break;
          }

          const { done, value } = await reader.read();
          if (done) {
            clearInterval(heartbeatTimer);
            // Only close if not already cancelled
            if (!isCancelled) {
              controller.close();
              streamLogger.debug({
                operation: 'stream.closed',
                requestId,
                traceId,
              }, 'Stream closed normally');
            }
            break;
          }
          lastActivity = Date.now();

          // Only enqueue if not cancelled
          if (!isCancelled) {
            controller.enqueue(value);
          }
        }
      } catch (error) {
        clearInterval(heartbeatTimer);

        // If already cancelled, don't try to send error events
        if (isCancelled) {
          streamLogger.debug({
            operation: 'stream.error_after_cancel',
            requestId,
            traceId,
          }, 'Stream error occurred after cancellation, ignoring');
          return;
        }

        const err = error instanceof Error ? error : new Error(String(error));
        streamLogger.error({
          operation: 'stream.read_error',
          requestId,
          traceId,
          error: { message: err.message, name: err.name, stack: err.stack },
        }, 'Stream read error');

        // Send error as SSE event instead of calling controller.error()
        const errorCode = classifyError(err);
        sendErrorAndClose(controller, err, errorCode);
      }
    },
    cancel() {
      isCancelled = true; // Mark as cancelled first
      clearInterval(heartbeatTimer);

      // Cancel the underlying reader
      reader.cancel().catch((err) => {
        streamLogger.debug({
          operation: 'stream.cancel_reader_failed',
          requestId,
          traceId,
          error: { message: err.message },
        }, 'Failed to cancel reader');
      });

      streamLogger.info({
        operation: 'stream.cancelled',
        requestId,
        traceId,
      }, 'Stream cancelled by client');
    },
  });

  return new Response(monitoredStream, {
    headers: originalResponse.headers,
  });
}

const app = new Hono();

// Enable CORS for frontend
app.use('*', cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true,
  exposeHeaders: ['X-Video-Id', 'X-Trace-Id'], // Expose custom headers so frontend can read them
}));

// Health check endpoint
app.get('/health', async (c) => {
  const qdrantConnected = await checkConnection();
  const stats = qdrantConnected ? await getCollectionStats() : null;

  return c.json({
    status: 'ok',
    qdrant: {
      connected: qdrantConnected,
      collection: stats?.exists ? 'transcripts' : null,
      pointCount: stats?.pointCount ?? 0,
    },
  });
});

/** Message part with text content */
interface TextPart {
  type: 'text';
  text: string;
}

/** Message part (can be text, reasoning, tool-invocation, etc.) */
interface MessagePart {
  type: string;
  text?: string;
}

/** UI Message format from AI SDK */
interface UIMessageFormat {
  id: string;
  role: string;
  parts?: MessagePart[];
}

/** Legacy message format */
interface LegacyMessageFormat {
  id: string;
  role: string;
  content: string;
}

type ChatMessage = UIMessageFormat | LegacyMessageFormat;

/**
 * AI SDK compatible chat endpoint
 * Works with useChat hook from @ai-sdk/react
 */
app.post('/api/chat', async (c) => {
  const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return tracer.startActiveSpan('chat.request', async (span) => {
    // Extract trace ID from active span
    const spanContext = span.spanContext();
    const traceId = spanContext.traceId;

    logger.info({
      operation: 'chat.request.start',
      requestId,
      traceId,
    }, 'Chat request started');

    try {
      const body = await c.req.json();
      const { messages, lectureTitle }: { messages: ChatMessage[]; lectureTitle?: string } = body;

      logger.debug({
        operation: 'chat.request.received',
        requestId,
        traceId,
        input: { messageCount: messages?.length ?? 0, lectureTitle: lectureTitle ?? null },
      }, 'Request data received');

      if (!messages || !Array.isArray(messages)) {
        logger.warn({
          operation: 'chat.request.validation_error',
          requestId,
          traceId,
          error: 'messages array is required',
        }, 'Validation failed');
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'messages array is required' });
        span.end();
        return c.json({ error: 'messages array is required' }, 400);
      }

      // Get the last user message
      const lastMessage = messages[messages.length - 1];
      if (!lastMessage || lastMessage.role !== 'user') {
        logger.warn({
          operation: 'chat.request.validation_error',
          requestId,
          traceId,
          error: 'Last message must be from user',
        }, 'Validation failed');
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'Last message must be from user' });
        span.end();
        return c.json({ error: 'Last message must be from user' }, 400);
      }

      // Extract text from parts (new format) or content (legacy format)
      let userText = '';
      if ('parts' in lastMessage && Array.isArray(lastMessage.parts)) {
        userText = lastMessage.parts
          .filter((p: { type: string }): p is { type: 'text'; text: string } => p.type === 'text')
          .map((p: { type: 'text'; text: string }) => p.text)
          .join('');
      } else if ('content' in lastMessage && typeof lastMessage.content === 'string') {
        userText = lastMessage.content;
      }

      logger.debug({
        operation: 'chat.request.user_message',
        requestId,
        traceId,
        input: { messageLength: userText.length, preview: userText.slice(0, 100) },
      }, 'User message extracted');

      if (!userText) {
        logger.warn({
          operation: 'chat.request.validation_error',
          requestId,
          traceId,
          error: 'User message must contain text',
        }, 'Validation failed');
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'User message must contain text' });
        span.end();
        return c.json({ error: 'User message must contain text' }, 400);
      }

      // Check for PII before processing
      logger.debug({
        operation: 'pii.check.start',
        requestId,
        traceId,
      }, 'Starting PII check');
      const piiResult = await analyzePII(userText);
      logger.info({
        operation: 'pii.check.complete',
        requestId,
        traceId,
        output: { hasPII: piiResult.hasPII, entityCount: piiResult.entities.length, durationMs: piiResult.durationMs },
      }, piiResult.hasPII ? 'PII detected' : 'No PII detected');

      if (piiResult.hasPII) {
        const entityTypes = [...new Set(piiResult.entities.map((e) => e.entity_type))];
        span.setAttribute('pii.detected', true);
        span.setAttribute('pii.entity_types', JSON.stringify(entityTypes));
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'PII detected' });
        span.end();

        const errorMessage = '⚠️ Wykryto dane osobowe w wiadomości. Proszę nie podawać danych osobowych takich jak imiona, nazwiska, adresy email czy numery telefonów.';
        const textId = `pii-error-${Date.now()}`;

        // Return error as AI SDK UI message stream format
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            // UI message stream format events with correct types
            controller.enqueue(encoder.encode('data: {"type":"start"}\n\n'));
            controller.enqueue(encoder.encode('data: {"type":"start-step"}\n\n'));
            controller.enqueue(encoder.encode(`data: {"type":"text-start","id":"${textId}"}\n\n`));
            controller.enqueue(encoder.encode(`data: {"type":"text-delta","id":"${textId}","delta":"${errorMessage}"}\n\n`));
            controller.enqueue(encoder.encode(`data: {"type":"text-end","id":"${textId}"}\n\n`));
            controller.enqueue(encoder.encode('data: {"type":"finish-step"}\n\n'));
            controller.enqueue(encoder.encode('data: {"type":"finish"}\n\n'));
            controller.close();
          },
        });

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        });
      }

      // Input: user message
      span.setAttribute('input.value', userText);

      // Prepare RAG context (search, build system prompt)
      logger.debug({
        operation: 'rag.prepare.start',
        requestId,
        traceId,
        input: { lectureTitle: lectureTitle ?? null },
      }, 'Preparing RAG context');
      const ragContextStart = Date.now();
      let ragContext;
      try {
        ragContext = await prepareRAGContext(userText, lectureTitle);
        const ragDurationMs = Date.now() - ragContextStart;
        logger.info({
          operation: 'rag.prepare.complete',
          requestId,
          traceId,
          durationMs: ragDurationMs,
          output: {
            sourcesCount: ragContext.sources?.length ?? 0,
            videoId: ragContext.videoId ?? null,
            systemPromptLength: ragContext.systemPrompt.length,
            contextPromptLength: ragContext.contextPrompt?.length ?? 0,
          },
        }, 'RAG context prepared');
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error({
          operation: 'rag.prepare.failed',
          requestId,
          traceId,
          durationMs: Date.now() - ragContextStart,
          error: { message: err.message, name: err.name, stack: err.stack },
        }, 'RAG context preparation failed');
        throw err;
      }

      // Build messages with RAG context injected
      const systemMessages = [
        { role: 'system' as const, content: ragContext.systemPrompt },
      ];

      if (ragContext.contextPrompt) {
        systemMessages.push({
          role: 'system' as const,
          content: ragContext.contextPrompt,
        });
      }

      // Convert messages to simple text format
      // This bypasses convertToModelMessages which creates internal references to reasoning items
      const conversationMessages = messages.map((msg) => {
        let textContent = '';

        if ('parts' in msg && Array.isArray(msg.parts)) {
          // Extract only text content from parts
          textContent = msg.parts
            .filter((p): p is TextPart => p.type === 'text' && typeof p.text === 'string')
            .map((p) => p.text)
            .join('');
        } else if ('content' in msg && typeof msg.content === 'string') {
          textContent = msg.content;
        }

        return {
          role: msg.role as 'user' | 'assistant',
          content: textContent,
        };
      });

      // Combine system messages with conversation
      const allMessages = [...systemMessages, ...conversationMessages];

      // Retry logic for API errors (max 2 retries)
      const maxRetries = 2;
      let lastError: Error | null = null;
      let result;

      logger.info({
        operation: 'stream.create.start',
        requestId,
        traceId,
        input: { model: MODEL_CONFIG.model, messageCount: allMessages.length },
      }, 'Creating streamText');

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          if (attempt > 0) {
            logger.warn({
              operation: 'stream.create.retry',
              requestId,
              traceId,
              attempt: attempt + 1,
              maxAttempts: maxRetries + 1,
            }, 'Retrying API call');
          }

          const streamStartTime = Date.now();
          result = streamText({
            model: openai(MODEL_CONFIG.model),
            maxRetries: 2, // AI SDK will retry failed requests automatically
            abortSignal: undefined, // Don't pass abort signal (let client handle cancellation)
            providerOptions: {
              openai: {
                reasoningEffort: MODEL_CONFIG.reasoningEffort,
              },
            },
            messages: allMessages,
            experimental_telemetry: { isEnabled: true },
            onChunk: ({ chunk }) => {
              logger.debug({
                operation: 'stream.chunk_received',
                requestId,
                traceId,
                timeSinceStart: Date.now() - streamStartTime,
                chunkType: chunk.type,
              }, 'Received chunk from OpenAI');
            },
            onFinish: ({ text, finishReason, usage }) => {
              logger.info({
                operation: 'stream.finished',
                requestId,
                traceId,
                durationMs: Date.now() - streamStartTime,
                output: {
                  finishReason,
                  textLength: text.length,
                  usage,
                },
              }, 'Stream finished successfully');
              // Output: response
              span.setAttribute('output.value', text);
              span.setStatus({ code: SpanStatusCode.OK });
              span.end();
            },
            onError: ({ error }) => {
              const err = error instanceof Error ? error : new Error(String(error));
              logger.error({
                operation: 'stream.error_callback',
                requestId,
                traceId,
                durationMs: Date.now() - streamStartTime,
                error: {
                  message: err.message,
                  name: err.name,
                  stack: err.stack,
                  cause: (err as any).cause,
                },
              }, 'Stream error callback triggered');
            },
          });

          // If we get here without error, break the retry loop
          logger.debug({
            operation: 'stream.create.success',
            requestId,
            traceId,
          }, 'streamText created successfully');
          break;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          logger.error({
            operation: 'stream.create.failed',
            requestId,
            traceId,
            attempt: attempt + 1,
            maxAttempts: maxRetries + 1,
            error: { message: lastError.message, stack: lastError.stack },
          }, 'API call failed');

          if (attempt === maxRetries) {
            throw lastError;
          }

          // Small delay before retry
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      if (!result) {
        logger.error({
          operation: 'stream.create.no_result',
          requestId,
          traceId,
        }, 'No result after retries');
        throw lastError ?? new Error('Failed to get response from API');
      }

      // Get the streaming response with monitoring
      logger.info({
        operation: 'stream.response.create',
        requestId,
        traceId,
      }, 'Creating monitored UI stream');

      let response;
      try {
        response = createMonitoredStream(result, requestId, traceId, logger);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error({
          operation: 'stream.response.create.failed',
          requestId,
          traceId,
          error: { message: err.message, name: err.name, stack: err.stack },
        }, 'Failed to create monitored stream');
        throw err;
      }

      // Add video context header for timestamp linking
      if (ragContext.videoId) {
        response.headers.set('X-Video-Id', ragContext.videoId);
      }

      // Add trace ID for feedback collection
      if (traceId) {
        response.headers.set('X-Trace-Id', traceId);
      }

      // Add request ID for debugging
      response.headers.set('X-Request-Id', requestId);

      // Ensure proper streaming headers
      response.headers.set('Cache-Control', 'no-cache, no-transform');
      response.headers.set('Connection', 'keep-alive');
      response.headers.set('X-Accel-Buffering', 'no'); // Disable nginx buffering

      logger.debug({
        operation: 'stream.response.sent',
        requestId,
        traceId,
      }, 'Stream response sent to client');

      return response;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error({
        operation: 'chat.request.failed',
        requestId,
        traceId,
        error: {
          message: err.message,
          name: err.name,
          stack: err.stack,
        },
      }, 'Chat request failed');

      span.setAttribute('output.value', JSON.stringify({ error: err.message }));
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      span.end();

      // Return error as SSE stream, not JSON (critical fix!)
      return createErrorStream(err, requestId, traceId);
    }
  });
});

/**
 * Legacy completion endpoint (non-streaming by default)
 * Kept for backwards compatibility
 */
app.post('/completion', async (c) => {
  try {
    const body = await c.req.json<CompletionRequest>();

    // Validate request
    if (!body.message || typeof body.message !== 'string') {
      return c.json({ error: 'message is required and must be a string' }, 400);
    }

    // Get or generate conversation ID
    const conversation = memory.getOrCreate(body.conversationId);

    // Handle streaming request (legacy custom format)
    if (body.stream) {
      const result = await processMessageStream(
        conversation.id,
        body.message,
        body.lectureTitle
      );

      // Early return (lecture selection, etc.) - return as JSON
      if (result.type === 'early') {
        const response: CompletionResponse = {
          conversationId: conversation.id,
          message: result.result.response,
          sources: result.result.sources,
          requiresLectureSelection: result.result.requiresLectureSelection,
          availableLectures: result.result.availableLectures,
          selectedLecture: result.result.selectedLecture,
        };
        return c.json(response);
      }

      // Use AI SDK's toTextStreamResponse for simpler streaming
      const { stream, metadata } = result;

      // Add metadata headers
      c.header('X-Conversation-Id', metadata.conversationId);
      if (metadata.selectedLecture) {
        c.header('X-Selected-Lecture', encodeURIComponent(metadata.selectedLecture));
      }
      if (metadata.sources) {
        c.header('X-Sources', encodeURIComponent(JSON.stringify(metadata.sources)));
      }

      return stream.toTextStreamResponse();
    }

    // Non-streaming request
    const result = await processMessage(
      conversation.id,
      body.message,
      body.lectureTitle
    );

    const response: CompletionResponse = {
      conversationId: conversation.id,
      message: result.response,
      sources: result.sources,
      requiresLectureSelection: result.requiresLectureSelection,
      availableLectures: result.availableLectures,
      selectedLecture: result.selectedLecture,
    };

    return c.json(response);
  } catch (error) {
    console.error('Error processing completion:', error);

    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: message }, 500);
  }
});

// Start server
logger.info({
  operation: 'server.start',
  port: SERVER_CONFIG.port,
  logLevel: process.env.LOG_LEVEL || 'info',
}, 'Starting server');

// Periodic health check (every 60s)
setInterval(async () => {
  const qdrantHealthy = await checkConnection();

  logger.info({
    operation: 'health.check',
    status: {
      qdrant: qdrantHealthy,
      openai: !!process.env.OPENAI_API_KEY,
      presidio: !!process.env.PRESIDIO_ANALYZER_URL,
    },
  }, 'Health status');
}, 60000);

export default {
  port: SERVER_CONFIG.port,
  fetch: app.fetch,
};
