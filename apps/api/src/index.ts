import './telemetry.js';

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { SERVER_CONFIG, MODEL_CONFIG } from './config.js';
import type { CompletionRequest, CompletionResponse } from './types.js';
import { processMessage, processMessageStream, prepareRAGContext } from './agent/lecture-qa.js';
import { checkConnection, getCollectionStats } from './services/qdrant.js';
import * as memory from './services/memory.js';
import { analyzePII } from './services/presidio.js';

const tracer = trace.getTracer('api');

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
  console.log(`[${requestId}] === Chat request started ===`);

  return tracer.startActiveSpan('chat.request', async (span) => {
    // Extract trace ID from active span
    const spanContext = span.spanContext();
    const traceId = spanContext.traceId;

    try {
      const body = await c.req.json();
      const { messages, lectureTitle }: { messages: ChatMessage[]; lectureTitle?: string } = body;
      console.log(`[${requestId}] Received ${messages?.length ?? 0} messages, lectureTitle: ${lectureTitle ?? 'none'}`);

      if (!messages || !Array.isArray(messages)) {
        console.log(`[${requestId}] ERROR: messages array is required`);
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'messages array is required' });
        span.end();
        return c.json({ error: 'messages array is required' }, 400);
      }

      // Get the last user message
      const lastMessage = messages[messages.length - 1];
      if (!lastMessage || lastMessage.role !== 'user') {
        console.log(`[${requestId}] ERROR: Last message must be from user`);
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

      console.log(`[${requestId}] User message: "${userText.slice(0, 100)}${userText.length > 100 ? '...' : ''}"`);

      if (!userText) {
        console.log(`[${requestId}] ERROR: User message must contain text`);
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'User message must contain text' });
        span.end();
        return c.json({ error: 'User message must contain text' }, 400);
      }

      // Check for PII before processing
      console.log(`[${requestId}] Checking for PII...`);
      const piiResult = await analyzePII(userText);
      console.log(`[${requestId}] PII check result: hasPII=${piiResult.hasPII}, entities=${piiResult.entities.length}`);

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
      console.log(`[${requestId}] Preparing RAG context...`);
      const ragContextStart = Date.now();
      const ragContext = await prepareRAGContext(userText, lectureTitle);
      console.log(`[${requestId}] RAG context prepared in ${Date.now() - ragContextStart}ms, sources: ${ragContext.sources?.length ?? 0}, videoId: ${ragContext.videoId ?? 'none'}`);
      console.log(`[${requestId}] System prompt length: ${ragContext.systemPrompt.length}, context prompt length: ${ragContext.contextPrompt?.length ?? 0}`);

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

      console.log(`[${requestId}] Starting streamText with model: ${MODEL_CONFIG.model}, messages: ${allMessages.length}`);

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          if (attempt > 0) {
            console.log(`[${requestId}] Retrying API call (attempt ${attempt + 1}/${maxRetries + 1})...`);
          }

          result = streamText({
            model: openai(MODEL_CONFIG.model, {
              structuredOutputs: true,
            }),
            maxRetries: 2, // AI SDK will retry failed requests automatically
            providerOptions: {
              openai: {
                reasoningEffort: MODEL_CONFIG.reasoningEffort,
              },
            },
            messages: allMessages,
            experimental_telemetry: { isEnabled: true },
            onFinish: ({ text, finishReason, usage }) => {
              console.log(`[${requestId}] streamText onFinish: finishReason=${finishReason}, textLength=${text.length}, usage=${JSON.stringify(usage)}`);
              // Output: response
              span.setAttribute('output.value', text);
              span.setStatus({ code: SpanStatusCode.OK });
              span.end();
            },
            onError: (error) => {
              console.error(`[${requestId}] streamText onError:`, error);
            },
          });

          // If we get here without error, break the retry loop
          console.log(`[${requestId}] streamText created successfully`);
          break;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          console.error(`[${requestId}] API call failed (attempt ${attempt + 1}/${maxRetries + 1}):`, lastError.message);
          console.error(`[${requestId}] Error stack:`, lastError.stack);

          if (attempt === maxRetries) {
            throw lastError;
          }

          // Small delay before retry
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      if (!result) {
        console.error(`[${requestId}] No result after retries`);
        throw lastError ?? new Error('Failed to get response from API');
      }

      // Get the streaming response
      console.log(`[${requestId}] Creating UI message stream response...`);
      const response = result.toUIMessageStreamResponse({
        sendReasoning: true,
      });

      console.log(`[${requestId}] Response created, returning stream to client`);

      // Add video context header for timestamp linking
      if (ragContext.videoId) {
        response.headers.set('X-Video-Id', ragContext.videoId);
      }

      // Add trace ID for feedback collection
      if (traceId) {
        response.headers.set('X-Trace-Id', traceId);
      }

      // Ensure proper streaming headers
      response.headers.set('Cache-Control', 'no-cache, no-transform');
      response.headers.set('Connection', 'keep-alive');
      response.headers.set('X-Accel-Buffering', 'no'); // Disable nginx buffering

      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const stack = error instanceof Error ? error.stack : undefined;
      console.error(`[${requestId}] === Chat request failed ===`);
      console.error(`[${requestId}] Error:`, message);
      if (stack) {
        console.error(`[${requestId}] Stack:`, stack);
      }
      span.setAttribute('output.value', JSON.stringify({ error: message }));
      span.setStatus({ code: SpanStatusCode.ERROR, message });
      span.end();
      return c.json({ error: message }, 500);
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
console.log(`Starting server on port ${SERVER_CONFIG.port}...`);

export default {
  port: SERVER_CONFIG.port,
  fetch: app.fetch,
};
