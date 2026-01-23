import { encode } from 'gpt-tokenizer';
import type { TranscriptSegment, TranscriptChunk, ChunkingConfig } from '../types.js';

/** Default chunking configuration optimized for transcript/speech content */
export const DEFAULT_CHUNKING_CONFIG: ChunkingConfig = {
  chunkSize: 400,       // target tokens per chunk (~1600 chars)
  overlapTokens: 80,    // 20% overlap
  minChunkSize: 100,    // minimum tokens to avoid tiny fragments
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
    return [{
      chunkIndex: 0,
      text: totalText,
      speaker: filteredSegments.length === 1 ? filteredSegments[0].speaker : null,
      startMs: filteredSegments[0].start,
      endMs: filteredSegments[filteredSegments.length - 1].end,
      segmentIndices: filteredSegments.map((_, i) => i),
      tokenCount: totalTokens,
    }];
  }

  const chunks: TranscriptChunk[] = [];
  let currentText = '';
  let currentSegmentIndices: number[] = [];
  let currentStartMs = 0;
  let currentEndMs = 0;
  let currentSpeaker: string | null = null;
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
      currentSpeaker = null;
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
        currentSpeaker = null; // Mixed speakers
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
      });
    }
  }

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
    });
  }

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
