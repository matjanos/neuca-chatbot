/** Model configuration for easy switching */
export const MODEL_CONFIG = {
  /** Chat model for generating responses */
  model: 'gpt-5-mini' as const,
  /** Reasoning effort level */
  reasoningEffort: 'medium' as const,
};

/** Embedding configuration */
export const EMBEDDING_CONFIG = {
  /** Model for generating embeddings */
  model: 'text-embedding-3-large' as const,
  /** Vector dimensions for the model */
  dimensions: 3072,
};

/** RAG configuration */
export const RAG_CONFIG = {
  /** Number of chunks to retrieve */
  topK: 8,
  /** Minimum similarity score threshold (lower = more results for general questions) */
  scoreThreshold: 0.3,
};

/** Server configuration */
export const SERVER_CONFIG = {
  port: parseInt(process.env.PORT || '3000', 10),
};
