import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { stream } from 'hono/streaming';
import { SERVER_CONFIG } from './config.js';
import type { CompletionRequest, CompletionResponse } from './types.js';
import { processMessage, processMessageStream } from './agent/lecture-qa.js';
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

// Main completion endpoint
app.post('/completion', async (c) => {
  try {
    const body = await c.req.json<CompletionRequest>();

    // Validate request
    if (!body.message || typeof body.message !== 'string') {
      return c.json({ error: 'message is required and must be a string' }, 400);
    }

    // Get or generate conversation ID
    const conversation = memory.getOrCreate(body.conversationId);

    // Handle streaming request
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

      // Stream the response using AI SDK's data stream protocol
      const { stream: textStream, metadata } = result;

      // Set headers for streaming
      c.header('Content-Type', 'text/event-stream');
      c.header('Cache-Control', 'no-cache');
      c.header('Connection', 'keep-alive');
      c.header('X-Conversation-Id', metadata.conversationId);
      if (metadata.selectedLecture) {
        c.header('X-Selected-Lecture', encodeURIComponent(metadata.selectedLecture));
      }

      return stream(c, async (streamWriter) => {
        // Send metadata as first event
        const metadataEvent = {
          type: 'metadata',
          conversationId: metadata.conversationId,
          sources: metadata.sources,
          selectedLecture: metadata.selectedLecture,
        };
        await streamWriter.write(`data: ${JSON.stringify(metadataEvent)}\n\n`);

        // Stream text chunks
        for await (const chunk of textStream.textStream) {
          const textEvent = { type: 'text', content: chunk };
          await streamWriter.write(`data: ${JSON.stringify(textEvent)}\n\n`);
        }

        // Send done event
        await streamWriter.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      });
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
