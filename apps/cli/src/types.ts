export interface VideoInfo {
  id: string;
  title: string;
  duration: number;
  url: string;
}

export interface TranscriptSegment {
  speaker: string;
  text: string;
  start: number;
  end: number;
}

export interface TranscriptionResult {
  segments: TranscriptSegment[];
  text: string;
}

export interface ColoredChar {
  char: string;
  color: string;
}

export interface TranscriptOutput {
  videoInfo: VideoInfo;
  segments: TranscriptSegment[];
  timestamp: string;
}

export interface SpeakerInfo {
  label: string;
  normalizedLabel: string;
  segmentCount: number;
  totalDuration: number;
  segments: TranscriptSegment[];
  assignedName?: string;
}

export interface AudioSample {
  segmentIndex: number;
  start: number;  // ms
  end: number;    // ms
  duration: number;
  text: string;
}

// Embedding types

/** Chunk representation during processing */
export interface TranscriptChunk {
  chunkIndex: number;
  text: string;
  speaker: string | null;
  startMs: number;
  endMs: number;
  segmentIndices: number[];    // Original segment indices
  tokenCount: number;
}

/** Payload stored in Qdrant */
export interface ChunkPayload {
  datasetId: string;           // yt-{videoId}
  docId: string;               // videoId
  sourceType: 'youtube' | 'file' | 'url';
  sourceUrl: string;
  title: string;
  language: string;
  chunkIndex: number;
  startSec: number;
  endSec: number;
  speaker: string | null;
  text: string;
  segmentIds: string[];
  tokenCount: number;
  version: string;
  ingestedAt: string;
}

/** Chunking configuration */
export interface ChunkingConfig {
  chunkSize: number;           // target tokens per chunk (default: 400)
  overlapTokens: number;       // overlap in tokens (default: 80)
  minChunkSize: number;        // minimum tokens (default: 100)
}

export type EmbeddingModel = 'text-embedding-3-small' | 'text-embedding-3-large';

/** Embedding configuration */
export interface EmbeddingConfig {
  model: EmbeddingModel;
  batchSize: number;           // chunks per API call (default: 100)
}
