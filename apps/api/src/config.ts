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
  /** Number of chunks to retrieve from semantic search */
  topK: 5,
  /** Minimum similarity score threshold (lower = more results for general questions) */
  scoreThreshold: 0.3,
  /** Whether to fetch neighboring chunks (prev/next) for context expansion */
  expandWithNeighbors: true,
};

/** Server configuration */
export const SERVER_CONFIG = {
  port: parseInt(process.env.PORT || '3000', 10),
};

/** PII detection configuration */
export const PII_CONFIG = {
  analyzerUrl: process.env.PRESIDIO_ANALYZER_URL || 'http://localhost:5002',
  /** Use 'en' as default Presidio image only supports English.
   *  Still detects universal patterns: emails, phones, URLs, credit cards, etc. */
  language: 'en',
  /** Higher threshold (0.9) to avoid false positives from English model on Polish text.
   *  Emails/phones still score 1.0, so they'll be caught. */
  scoreThreshold: 0.9,
  enabled: process.env.PII_CHECK_ENABLED !== 'false',
};
