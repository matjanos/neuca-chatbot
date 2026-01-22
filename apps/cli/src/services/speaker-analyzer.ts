import type { TranscriptSegment, SpeakerInfo, AudioSample } from '../types.js';

/**
 * Normalize speaker label to consistent format (e.g., "Speaker A" -> "A")
 */
function normalizeSpeakerLabel(speaker: string): string {
  // Handle "Speaker X" format
  const match = speaker.match(/^Speaker\s+([A-Z])$/i);
  if (match) {
    return match[1].toUpperCase();
  }
  // Handle "SPEAKER_XX" format
  const numMatch = speaker.match(/^SPEAKER_(\d+)$/i);
  if (numMatch) {
    return String.fromCharCode(65 + parseInt(numMatch[1], 10));
  }
  // Return as-is for other formats
  return speaker;
}

/**
 * Analyze transcript segments and extract speaker information
 */
export function analyzeSpeakers(segments: TranscriptSegment[]): SpeakerInfo[] {
  const speakerMap = new Map<string, SpeakerInfo>();

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const normalizedLabel = normalizeSpeakerLabel(segment.speaker);

    if (!speakerMap.has(normalizedLabel)) {
      speakerMap.set(normalizedLabel, {
        label: segment.speaker,
        normalizedLabel,
        segmentCount: 0,
        totalDuration: 0,
        segments: [],
      });
    }

    const info = speakerMap.get(normalizedLabel)!;
    info.segmentCount++;
    info.totalDuration += segment.end - segment.start;
    info.segments.push(segment);
  }

  // Sort speakers alphabetically by normalized label
  return Array.from(speakerMap.values()).sort((a, b) =>
    a.normalizedLabel.localeCompare(b.normalizedLabel)
  );
}

/**
 * Select audio samples for a speaker based on segment distribution
 * Prefers segments between 5-15 seconds from different parts of the recording
 */
export function selectSamplesForSpeaker(speakerInfo: SpeakerInfo, maxSamples = 3): AudioSample[] {
  const samples: AudioSample[] = [];
  const segments = speakerInfo.segments;

  if (segments.length === 0) {
    return samples;
  }

  // Filter segments that are at least 5 seconds and prefer 5-15 seconds
  const goodSegments = segments
    .map((seg, idx) => ({
      segment: seg,
      originalIndex: idx,
      duration: seg.end - seg.start,
    }))
    .filter(s => s.duration >= 5000) // At least 5 seconds
    .sort((a, b) => {
      // Prefer segments between 5-15 seconds
      const aInRange = a.duration >= 5000 && a.duration <= 15000;
      const bInRange = b.duration >= 5000 && b.duration <= 15000;
      if (aInRange && !bInRange) return -1;
      if (!aInRange && bInRange) return 1;
      // If both in range or both out of range, prefer shorter
      return a.duration - b.duration;
    });

  if (goodSegments.length === 0) {
    // Fall back to using any segment if none meet the minimum duration
    const fallbackSegment = segments.reduce((best, current, idx) => {
      const duration = current.end - current.start;
      if (duration > (best.segment.end - best.segment.start)) {
        return { segment: current, originalIndex: idx, duration };
      }
      return best;
    }, { segment: segments[0], originalIndex: 0, duration: segments[0].end - segments[0].start });

    samples.push({
      segmentIndex: fallbackSegment.originalIndex,
      start: fallbackSegment.segment.start,
      end: Math.min(fallbackSegment.segment.end, fallbackSegment.segment.start + 15000),
      duration: Math.min(fallbackSegment.duration, 15000),
      text: fallbackSegment.segment.text.substring(0, 200) + (fallbackSegment.segment.text.length > 200 ? '...' : ''),
    });
    return samples;
  }

  // Select samples from beginning, middle, and end of timeline
  const totalSegments = goodSegments.length;
  const indices: number[] = [];

  if (totalSegments === 1) {
    indices.push(0);
  } else if (totalSegments === 2) {
    indices.push(0, 1);
  } else {
    // Beginning, middle, end
    indices.push(0);
    indices.push(Math.floor(totalSegments / 2));
    indices.push(totalSegments - 1);
  }

  // Limit to maxSamples
  const selectedIndices = indices.slice(0, maxSamples);

  for (const idx of selectedIndices) {
    const segmentData = goodSegments[idx];
    const segment = segmentData.segment;

    // Limit sample duration to 15 seconds max
    const sampleEnd = Math.min(segment.end, segment.start + 15000);
    const sampleDuration = sampleEnd - segment.start;

    samples.push({
      segmentIndex: segmentData.originalIndex,
      start: segment.start,
      end: sampleEnd,
      duration: sampleDuration,
      text: segment.text.substring(0, 200) + (segment.text.length > 200 ? '...' : ''),
    });
  }

  return samples;
}

/**
 * Format duration in milliseconds to human-readable string
 */
export function formatSpeakerDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
}
