import { encode } from 'gpt-tokenizer';
import type { TranscriptSegment, TranscriptChunk, ChunkingConfig } from '../types.js';

/** Default chunking configuration optimized for transcript/speech content */
export const DEFAULT_CHUNKING_CONFIG: ChunkingConfig = {
  chunkSize: 400,       // target tokens per chunk (~1600 chars)
  overlapTokens: 80,    // 20% overlap
  minChunkSize: 100,    // minimum tokens to avoid tiny fragments
  strategy: 'token',    // default to token-based chunking
};

/** Default configuration for speaker-based chunking */
export const DEFAULT_SPEAKER_CHUNKING_CONFIG: ChunkingConfig = {
  chunkSize: 400,       // max tokens before splitting a speaker turn
  overlapTokens: 0,     // no overlap in speaker-based mode
  minChunkSize: 0,      // keep all speaker turns regardless of length
  strategy: 'speaker',
};

/** Minimum segment duration in milliseconds to filter noise */
const MIN_SEGMENT_DURATION_MS = 500;

/**
 * Count tokens in text using gpt-tokenizer
 */
export function countTokens(text: string): number {
  return encode(text).length;
}

/**
 * Chunk transcript segments with speaker-aware boundaries and overlap
 *
 * Strategy:
 * 1. Filter out very short segments (noise)
 * 2. Merge consecutive segments from same speaker until reaching token limit
 * 3. If single segment exceeds limit, split at sentence boundaries
 * 4. Apply overlap between chunks
 */
export function chunkTranscript(
  segments: TranscriptSegment[],
  config: ChunkingConfig = DEFAULT_CHUNKING_CONFIG
): TranscriptChunk[] {
  const { chunkSize, overlapTokens, minChunkSize } = config;

  // Filter out very short segments (noise)
  const filteredSegments = segments.filter(
    s => (s.end - s.start) >= MIN_SEGMENT_DURATION_MS && s.text.trim().length > 0
  );

  if (filteredSegments.length === 0) {
    return [];
  }

  // For very short transcripts, return single chunk
  const totalText = filteredSegments.map(s => s.text).join(' ');
  const totalTokens = countTokens(totalText);

  if (filteredSegments.length < 5 || totalTokens <= chunkSize) {
    const speaker = filteredSegments.length === 1
      ? filteredSegments[0].speaker
      : 'Mixed';
    return [{
      chunkIndex: 0,
      text: totalText,
      speaker,
      startMs: filteredSegments[0].start,
      endMs: filteredSegments[filteredSegments.length - 1].end,
      segmentIndices: filteredSegments.map((_, i) => i),
      tokenCount: totalTokens,
      prevChunkIndex: null,
      nextChunkIndex: null,
      speakerTurnIndex: 0,
      isPartialTurn: false,
    }];
  }

  const chunks: TranscriptChunk[] = [];
  let currentText = '';
  let currentSegmentIndices: number[] = [];
  let currentStartMs = 0;
  let currentEndMs = 0;
  let currentSpeaker = 'Unknown';
  let overlapBuffer: { text: string; indices: number[]; endMs: number } | null = null;

  for (let i = 0; i < filteredSegments.length; i++) {
    const segment = filteredSegments[i];
    const segmentTokens = countTokens(segment.text);

    // Handle very long single segments by splitting at sentence boundaries
    if (segmentTokens > chunkSize) {
      // First, flush current buffer if exists
      if (currentText.trim()) {
        const tokenCount = countTokens(currentText);
        if (tokenCount >= minChunkSize) {
          chunks.push({
            chunkIndex: chunks.length,
            text: currentText.trim(),
            speaker: currentSpeaker,
            startMs: currentStartMs,
            endMs: currentEndMs,
            segmentIndices: [...currentSegmentIndices],
            tokenCount,
            prevChunkIndex: null,  // Will be populated later
            nextChunkIndex: null,
            speakerTurnIndex: chunks.length,  // Token-based: each chunk is its own turn
            isPartialTurn: false,
          });

          // Prepare overlap for next chunk
          overlapBuffer = createOverlapBuffer(currentText, currentSegmentIndices, currentEndMs, overlapTokens);
        }
      }

      // Split long segment into smaller chunks
      const splitChunks = splitLongSegment(segment, i, chunkSize, overlapTokens, chunks.length);
      for (const splitChunk of splitChunks) {
        if (splitChunk.tokenCount >= minChunkSize) {
          chunks.push(splitChunk);
        }
      }

      // Reset state
      currentText = '';
      currentSegmentIndices = [];
      currentSpeaker = 'Unknown';
      overlapBuffer = null;
      continue;
    }

    // Initialize with overlap buffer if available
    if (currentText === '' && overlapBuffer) {
      currentText = overlapBuffer.text;
      currentStartMs = segment.start; // New chunk starts from current segment
      currentEndMs = overlapBuffer.endMs;
      // Don't carry over segment indices from overlap to avoid double-counting
      currentSegmentIndices = [];
    }

    // Check if adding this segment would exceed limit
    const testText = currentText + (currentText ? ' ' : '') + segment.text;
    const testTokens = countTokens(testText);

    if (testTokens > chunkSize && currentText.trim()) {
      // Flush current chunk
      const tokenCount = countTokens(currentText);
      if (tokenCount >= minChunkSize) {
        chunks.push({
          chunkIndex: chunks.length,
          text: currentText.trim(),
          speaker: currentSpeaker,
          startMs: currentStartMs,
          endMs: currentEndMs,
          segmentIndices: [...currentSegmentIndices],
          tokenCount,
          prevChunkIndex: null,  // Will be populated later
          nextChunkIndex: null,
          speakerTurnIndex: chunks.length,  // Token-based: each chunk is its own turn
          isPartialTurn: false,
        });

        // Prepare overlap for next chunk
        overlapBuffer = createOverlapBuffer(currentText, currentSegmentIndices, currentEndMs, overlapTokens);
      }

      // Start new chunk with overlap
      if (overlapBuffer) {
        currentText = overlapBuffer.text + ' ' + segment.text;
      } else {
        currentText = segment.text;
      }
      currentSegmentIndices = [i];
      currentStartMs = segment.start;
      currentEndMs = segment.end;
      currentSpeaker = segment.speaker;
    } else {
      // Add segment to current chunk
      if (currentText === '') {
        currentStartMs = segment.start;
        currentSpeaker = segment.speaker;
      }
      currentText = testText;
      currentSegmentIndices.push(i);
      currentEndMs = segment.end;

      // Track speaker changes
      if (currentSpeaker !== segment.speaker) {
        currentSpeaker = 'Mixed'; // Mixed speakers in this chunk
      }
    }
  }

  // Don't forget the last chunk
  if (currentText.trim()) {
    const tokenCount = countTokens(currentText);
    if (tokenCount >= minChunkSize || chunks.length === 0) {
      chunks.push({
        chunkIndex: chunks.length,
        text: currentText.trim(),
        speaker: currentSpeaker,
        startMs: currentStartMs,
        endMs: currentEndMs,
        segmentIndices: currentSegmentIndices,
        tokenCount,
        prevChunkIndex: null,  // Will be populated below
        nextChunkIndex: null,
        speakerTurnIndex: chunks.length,  // Token-based: each chunk is its own turn
        isPartialTurn: false,
      });
    }
  }

  // Populate prev/next pointers
  populateChunkPointers(chunks);

  return chunks;
}

/**
 * Create overlap buffer from end of text
 */
function createOverlapBuffer(
  text: string,
  segmentIndices: number[],
  endMs: number,
  overlapTokens: number
): { text: string; indices: number[]; endMs: number } {
  const tokens = encode(text);
  if (tokens.length <= overlapTokens) {
    return { text, indices: segmentIndices, endMs };
  }

  // Take last overlapTokens tokens
  const overlapTokenList = tokens.slice(-overlapTokens);

  // Find approximate character position
  // We need to find where these tokens start in the original text
  // This is approximate since tokenization isn't 1:1 with chars
  const fullText = text;
  let overlapText = '';

  // Work backwards through words to build overlap
  const words = fullText.split(/\s+/);
  const wordsFromEnd: string[] = [];
  let tokenCount = 0;

  for (let i = words.length - 1; i >= 0; i--) {
    const word = words[i];
    const wordTokens = countTokens(word);
    if (tokenCount + wordTokens > overlapTokens) {
      break;
    }
    wordsFromEnd.unshift(word);
    tokenCount += wordTokens;
  }

  overlapText = wordsFromEnd.join(' ');

  return {
    text: overlapText,
    indices: segmentIndices.slice(-1), // Just reference last segment
    endMs,
  };
}

/**
 * Split a very long segment into smaller chunks at sentence boundaries
 */
function splitLongSegment(
  segment: TranscriptSegment,
  segmentIndex: number,
  chunkSize: number,
  overlapTokens: number,
  startChunkIndex: number
): TranscriptChunk[] {
  const chunks: TranscriptChunk[] = [];
  const text = segment.text;

  // Split at sentence boundaries
  const sentences = text.split(/(?<=[.!?])\s+/);

  let currentText = '';
  let chunkIndex = startChunkIndex;

  for (const sentence of sentences) {
    const testText = currentText + (currentText ? ' ' : '') + sentence;
    const testTokens = countTokens(testText);

    if (testTokens > chunkSize && currentText) {
      // Calculate approximate time range based on text position
      const textRatio = currentText.length / text.length;
      const duration = segment.end - segment.start;
      const chunkEndMs = segment.start + Math.floor(duration * textRatio);

      chunks.push({
        chunkIndex,
        text: currentText.trim(),
        speaker: segment.speaker,
        startMs: chunks.length === 0 ? segment.start : chunks[chunks.length - 1].endMs,
        endMs: chunkEndMs,
        segmentIndices: [segmentIndex],
        tokenCount: countTokens(currentText),
        prevChunkIndex: null,  // Will be populated later
        nextChunkIndex: null,
        speakerTurnIndex: chunkIndex,  // Token-based: each chunk is its own turn
        isPartialTurn: false,
      });

      chunkIndex++;

      // Start new chunk with overlap
      currentText = createOverlapBuffer(currentText, [segmentIndex], chunkEndMs, overlapTokens).text + ' ' + sentence;
    } else {
      currentText = testText;
    }
  }

  // Last chunk
  if (currentText.trim()) {
    chunks.push({
      chunkIndex,
      text: currentText.trim(),
      speaker: segment.speaker,
      startMs: chunks.length === 0 ? segment.start : chunks[chunks.length - 1].endMs,
      endMs: segment.end,
      segmentIndices: [segmentIndex],
      tokenCount: countTokens(currentText),
      prevChunkIndex: null,  // Will be populated later
      nextChunkIndex: null,
      speakerTurnIndex: chunkIndex,  // Token-based: each chunk is its own turn
      isPartialTurn: false,
    });
  }

  return chunks;
}

/**
 * Populate prev/next chunk pointers after all chunks are created
 */
function populateChunkPointers(chunks: TranscriptChunk[]): void {
  for (let i = 0; i < chunks.length; i++) {
    chunks[i].prevChunkIndex = i > 0 ? i - 1 : null;
    chunks[i].nextChunkIndex = i < chunks.length - 1 ? i + 1 : null;
  }
}

/**
 * Speaker turn representation for grouping
 */
interface SpeakerTurn {
  speaker: string;
  segments: Array<{ index: number; segment: TranscriptSegment }>;
  text: string;
  startMs: number;
  endMs: number;
  tokenCount: number;
}

/**
 * Group consecutive segments by speaker into turns
 */
function groupSegmentsIntoTurns(segments: TranscriptSegment[]): SpeakerTurn[] {
  if (segments.length === 0) return [];

  const turns: SpeakerTurn[] = [];
  let currentTurn: SpeakerTurn | null = null;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];

    if (!currentTurn || currentTurn.speaker !== segment.speaker) {
      // Start a new turn
      if (currentTurn) {
        turns.push(currentTurn);
      }
      currentTurn = {
        speaker: segment.speaker,
        segments: [{ index: i, segment }],
        text: segment.text,
        startMs: segment.start,
        endMs: segment.end,
        tokenCount: countTokens(segment.text),
      };
    } else {
      // Continue current turn
      currentTurn.segments.push({ index: i, segment });
      currentTurn.text += ' ' + segment.text;
      currentTurn.endMs = segment.end;
      currentTurn.tokenCount = countTokens(currentTurn.text);
    }
  }

  // Don't forget the last turn
  if (currentTurn) {
    turns.push(currentTurn);
  }

  return turns;
}

/**
 * Split a speaker turn at sentence boundaries when it exceeds token limit
 */
function splitSpeakerTurn(
  turn: SpeakerTurn,
  turnIndex: number,
  maxTokens: number,
  startChunkIndex: number
): TranscriptChunk[] {
  const chunks: TranscriptChunk[] = [];

  // Split text at sentence boundaries
  const sentences = turn.text.split(/(?<=[.!?])\s+/);
  let currentText = '';
  let chunkIndex = startChunkIndex;
  let currentStartMs = turn.startMs;

  for (const sentence of sentences) {
    const testText = currentText + (currentText ? ' ' : '') + sentence;
    const testTokens = countTokens(testText);

    if (testTokens > maxTokens && currentText) {
      // Calculate approximate time range based on text position
      const textRatio = currentText.length / turn.text.length;
      const duration = turn.endMs - turn.startMs;
      const chunkEndMs = turn.startMs + Math.floor(duration * textRatio);

      chunks.push({
        chunkIndex,
        text: currentText.trim(),
        speaker: turn.speaker,
        startMs: currentStartMs,
        endMs: chunkEndMs,
        segmentIndices: turn.segments.map(s => s.index),
        tokenCount: countTokens(currentText),
        prevChunkIndex: null,  // Will be populated later
        nextChunkIndex: null,
        speakerTurnIndex: turnIndex,
        isPartialTurn: true,
      });

      chunkIndex++;
      currentText = sentence;
      currentStartMs = chunkEndMs;
    } else {
      currentText = testText;
    }
  }

  // Last chunk from this turn
  if (currentText.trim()) {
    chunks.push({
      chunkIndex,
      text: currentText.trim(),
      speaker: turn.speaker,
      startMs: currentStartMs,
      endMs: turn.endMs,
      segmentIndices: turn.segments.map(s => s.index),
      tokenCount: countTokens(currentText),
      prevChunkIndex: null,  // Will be populated later
      nextChunkIndex: null,
      speakerTurnIndex: turnIndex,
      isPartialTurn: chunks.length > 0,  // Only partial if we created earlier chunks
    });
  }

  return chunks;
}

/**
 * Chunk transcript by speaker turns
 *
 * Strategy:
 * 1. Filter out very short segments (noise)
 * 2. Group consecutive segments by speaker into "turns"
 * 3. For each turn:
 *    - If under token limit: create single chunk
 *    - If over limit: split at sentence boundaries, mark isPartialTurn=true
 * 4. Populate prev/next pointers
 */
export function chunkTranscriptBySpeaker(
  segments: TranscriptSegment[],
  config: ChunkingConfig = DEFAULT_SPEAKER_CHUNKING_CONFIG
): TranscriptChunk[] {
  const { chunkSize } = config;

  // Filter out very short segments (noise)
  const filteredSegments = segments.filter(
    s => (s.end - s.start) >= MIN_SEGMENT_DURATION_MS && s.text.trim().length > 0
  );

  if (filteredSegments.length === 0) {
    return [];
  }

  // Group consecutive segments by speaker into turns
  const turns = groupSegmentsIntoTurns(filteredSegments);

  // Create chunks from turns
  const chunks: TranscriptChunk[] = [];

  for (let turnIndex = 0; turnIndex < turns.length; turnIndex++) {
    const turn = turns[turnIndex];

    if (turn.tokenCount <= chunkSize) {
      // Single chunk for this turn
      chunks.push({
        chunkIndex: chunks.length,
        text: turn.text.trim(),
        speaker: turn.speaker,
        startMs: turn.startMs,
        endMs: turn.endMs,
        segmentIndices: turn.segments.map(s => s.index),
        tokenCount: turn.tokenCount,
        prevChunkIndex: null,  // Will be populated later
        nextChunkIndex: null,
        speakerTurnIndex: turnIndex,
        isPartialTurn: false,
      });
    } else {
      // Split long turn at sentence boundaries
      const turnChunks = splitSpeakerTurn(turn, turnIndex, chunkSize, chunks.length);
      for (const chunk of turnChunks) {
        chunks.push(chunk);
      }
    }
  }

  // Populate prev/next pointers
  populateChunkPointers(chunks);

  return chunks;
}

/**
 * Get chunking statistics for display
 */
export function getChunkingStats(chunks: TranscriptChunk[]): {
  totalChunks: number;
  totalTokens: number;
  avgTokensPerChunk: number;
  minTokens: number;
  maxTokens: number;
} {
  if (chunks.length === 0) {
    return {
      totalChunks: 0,
      totalTokens: 0,
      avgTokensPerChunk: 0,
      minTokens: 0,
      maxTokens: 0,
    };
  }

  const tokenCounts = chunks.map(c => c.tokenCount);
  const totalTokens = tokenCounts.reduce((a, b) => a + b, 0);

  return {
    totalChunks: chunks.length,
    totalTokens,
    avgTokensPerChunk: Math.round(totalTokens / chunks.length),
    minTokens: Math.min(...tokenCounts),
    maxTokens: Math.max(...tokenCounts),
  };
}
