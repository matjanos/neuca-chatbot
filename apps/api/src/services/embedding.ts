import { openai } from '@ai-sdk/openai';
import { embed } from 'ai';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import pino from 'pino';
import { EMBEDDING_CONFIG } from '../config.js';

const tracer = trace.getTracer('embedding');
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
}).child({ service: 'embedding' });

/**
 * Generate embedding for a query string
 */
export async function generateQueryEmbedding(query: string): Promise<number[]> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is required for embeddings');
  }

  const startTime = Date.now();

  return tracer.startActiveSpan('ai.embed', async (span) => {
    try {
      // Input: the query text and model info
      const inputData = {
        queryPreview: query.slice(0, 50),
        queryLength: query.length,
        model: EMBEDDING_CONFIG.model,
      };
      span.setAttribute('input.value', JSON.stringify(inputData));

      logger.debug({
        operation: 'embedding.generate.start',
        input: inputData,
      }, 'Generating embedding');

      const model = openai.embedding(EMBEDDING_CONFIG.model);

      const { embedding } = await embed({
        model,
        value: query,
        experimental_telemetry: { isEnabled: true },
      });

      const durationMs = Date.now() - startTime;

      // Output: embedding metadata (not the full vector, which is too large)
      const outputData = {
        dimensions: embedding.length,
        vector_preview: embedding.slice(0, 5).map(v => v.toFixed(4)),
        model: EMBEDDING_CONFIG.model,
        duration_ms: durationMs,
      };
      span.setAttribute('output.value', JSON.stringify(outputData));
      span.setStatus({ code: SpanStatusCode.OK });

      logger.info({
        operation: 'embedding.generate.complete',
        durationMs,
        output: { dimensions: embedding.length },
      }, 'Embedding generated');

      return embedding;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error({
        operation: 'embedding.generate.failed',
        durationMs: Date.now() - startTime,
        error: { message: err.message, name: err.name },
      }, 'Embedding generation failed');
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      throw error;
    } finally {
      span.end();
    }
  });
}
