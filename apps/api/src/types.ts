import type { ModelMessage } from 'ai';

/** API Request for /completion endpoint */
export interface CompletionRequest {
  conversationId?: string;
  message: string;
  lectureTitle?: string;
  /** Enable streaming response */
  stream?: boolean;
}

/** API Response for /completion endpoint */
export interface CompletionResponse {
  conversationId: string;
  message: string;
  sources?: Source[];
  /** Set when user needs to select a lecture before proceeding */
  requiresLectureSelection?: boolean;
  /** Available lectures to choose from */
  availableLectures?: string[];
  /** Currently selected lecture */
  selectedLecture?: string;
}

/** Source reference from RAG search */
export interface Source {
  text: string;
  speaker: string;
  startSec: number;
  endSec: number;
  sourceUrl?: string;
  docId?: string;
}

/** Conversation stored in memory */
export interface Conversation {
  id: string;
  lectureTitle?: string;
  messages: ModelMessage[];
  createdAt: Date;
  updatedAt: Date;
}

/** Payload stored in Qdrant (matching CLI types) */
export interface ChunkPayload {
  datasetId: string;
  docId: string;
  sourceType: 'youtube' | 'file' | 'url';
  sourceUrl: string;
  title: string;
  language: string;
  chunkIndex: number;
  startSec: number;
  endSec: number;
  speaker: string;
  text: string;
  segmentIds: string[];
  tokenCount: number;
  prevChunkIndex: number | null;
  nextChunkIndex: number | null;
  speakerTurnIndex: number;
  isPartialTurn: boolean;
  version: string;
  ingestedAt: string;
}

/** Search result from Qdrant */
export interface SearchResult {
  payload: ChunkPayload;
  score: number;
}
