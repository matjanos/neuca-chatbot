import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { SERVER_CONFIG, MODEL_CONFIG } from './config.js';
import type { CompletionRequest, CompletionResponse } from './types.js';
import { processMessage, processMessageStream, prepareRAGContext } from './agent/lecture-qa.js';
import { checkConnection, getCollectionStats } from './services/qdrant.js';
import * as memory from './services/memory.js';

const app = new Hono();

// Enable CORS
app.use('*', cors());

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
  try {
    const { messages, lectureTitle }: { messages: ChatMessage[]; lectureTitle?: string } = await c.req.json();

    if (!messages || !Array.isArray(messages)) {
      return c.json({ error: 'messages array is required' }, 400);
    }

    // Get the last user message
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== 'user') {
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

    if (!userText) {
      return c.json({ error: 'User message must contain text' }, 400);
    }

    // Prepare RAG context (search, build system prompt)
    const ragContext = await prepareRAGContext(userText, lectureTitle);

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

    const result = streamText({
      model: openai(MODEL_CONFIG.model),
      providerOptions: {
        openai: {
          reasoningEffort: MODEL_CONFIG.reasoningEffort,
        },
      },
      messages: allMessages,
    });

    // Get the streaming response
    const response = result.toUIMessageStreamResponse({
      sendReasoning: true,
    });

    // Add video context headers for timestamp linking
    if (ragContext.videoId) {
      response.headers.set('X-Video-Id', ragContext.videoId);
    }

    return response;
  } catch (error) {
    console.error('Error processing chat:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: message }, 500);
  }
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
