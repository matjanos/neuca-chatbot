import { openai } from '@ai-sdk/openai';
import { embedMany } from 'ai';
import type { EmbeddingModel, EmbeddingConfig } from '../types.js';

/** Default embedding configuration */
export const DEFAULT_EMBEDDING_CONFIG: EmbeddingConfig = {
  model: 'text-embedding-3-large',
  batchSize: 100, // OpenAI supports up to 2048 inputs per request
};

/** Vector dimensions for each model */
export const EMBEDDING_DIMENSIONS: Record<EmbeddingModel, number> = {
  'text-embedding-3-small': 1536,
  'text-embedding-3-large': 3072,
};

/**
 * Generate embeddings for multiple texts using OpenAI
 *
 * Uses the AI SDK's embedMany function for efficient batch processing.
 * Handles rate limiting internally through the SDK's maxParallelCalls.
 */
export async function generateEmbeddings(
  texts: string[],
  config: EmbeddingConfig = DEFAULT_EMBEDDING_CONFIG
): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  // Validate API key
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is required for embeddings');
  }

  const model = openai.embedding(config.model);

  // Process in batches if needed
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += config.batchSize) {
    const batch = texts.slice(i, i + config.batchSize);

    const { embeddings } = await embedMany({
      model,
      values: batch,
    });

    allEmbeddings.push(...embeddings);
  }

  return allEmbeddings;
}

/**
 * Generate a single embedding for a query string
 */
export async function generateQueryEmbedding(
  query: string,
  model: EmbeddingModel = 'text-embedding-3-large'
): Promise<number[]> {
  const embeddings = await generateEmbeddings([query], { model, batchSize: 1 });
  return embeddings[0];
}

/**
 * Estimate embedding cost based on token count
 *
 * Pricing (as of 2024):
 * - text-embedding-3-small: $0.02 / 1M tokens
 * - text-embedding-3-large: $0.13 / 1M tokens
 */
export function estimateEmbeddingCost(
  totalTokens: number,
  model: EmbeddingModel
): number {
  const pricePerMillionTokens: Record<EmbeddingModel, number> = {
    'text-embedding-3-small': 0.02,
    'text-embedding-3-large': 0.13,
  };

  return (totalTokens / 1_000_000) * pricePerMillionTokens[model];
}

/**
 * Get model info for display
 */
export function getModelInfo(model: EmbeddingModel): {
  name: string;
  dimensions: number;
  description: string;
} {
  const info: Record<EmbeddingModel, { name: string; dimensions: number; description: string }> = {
    'text-embedding-3-small': {
      name: 'text-embedding-3-small',
      dimensions: 1536,
      description: 'Fast and cost-effective, good for most use cases',
    },
    'text-embedding-3-large': {
      name: 'text-embedding-3-large',
      dimensions: 3072,
      description: 'Higher quality, better for semantic search',
    },
  };

  return info[model];
}
