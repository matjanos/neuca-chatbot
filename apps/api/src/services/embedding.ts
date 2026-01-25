import { openai } from '@ai-sdk/openai';
import { embed } from 'ai';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { EMBEDDING_CONFIG } from '../config.js';

const tracer = trace.getTracer('embedding');

/**
 * Generate embedding for a query string
 */
export async function generateQueryEmbedding(query: string): Promise<number[]> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is required for embeddings');
  }

  return tracer.startActiveSpan('ai.embed', async (span) => {
    try {
      // Input: the query text and model info
      const inputData = {
        query,
        model: EMBEDDING_CONFIG.model,
      };
      span.setAttribute('input.value', JSON.stringify(inputData));

      const model = openai.embedding(EMBEDDING_CONFIG.model);

      const { embedding } = await embed({
        model,
        value: query,
        experimental_telemetry: { isEnabled: true },
      });

      // Output: embedding metadata (not the full vector, which is too large)
      const outputData = {
        dimensions: embedding.length,
        vector_preview: embedding.slice(0, 5).map(v => v.toFixed(4)),
        model: EMBEDDING_CONFIG.model,
      };
      span.setAttribute('output.value', JSON.stringify(outputData));
      span.setStatus({ code: SpanStatusCode.OK });

      return embedding;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
      throw error;
    } finally {
      span.end();
    }
  });
}
