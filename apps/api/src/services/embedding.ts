import { openai } from '@ai-sdk/openai';
import { embed } from 'ai';
import { EMBEDDING_CONFIG } from '../config.js';

/**
 * Generate embedding for a query string
 */
export async function generateQueryEmbedding(query: string): Promise<number[]> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is required for embeddings');
  }

  const model = openai.embedding(EMBEDDING_CONFIG.model);

  const { embedding } = await embed({
    model,
    value: query,
  });

  return embedding;
}
