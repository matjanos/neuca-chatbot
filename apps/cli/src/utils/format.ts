import type { TranscriptSegment, VideoInfo } from '../types.js';

/**
 * Format milliseconds to HH:MM:SS format
 */
export function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((n) => n.toString().padStart(2, '0'))
    .join(':');
}

/**
 * Format duration in seconds to MM:SS or HH:MM:SS format
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return [hours, minutes, secs]
      .map((n) => n.toString().padStart(2, '0'))
      .join(':');
  }
  return [minutes, secs].map((n) => n.toString().padStart(2, '0')).join(':');
}

/**
 * Generate speaker label from speaker ID
 */
export function getSpeakerLabel(speakerId: string | number): string {
  if (typeof speakerId === 'number') {
    return `Speaker ${String.fromCharCode(65 + speakerId)}`;
  }
  // Handle string speaker IDs like "A", "B", or "speaker_0"
  if (speakerId.match(/^[A-Z]$/)) {
    return `Speaker ${speakerId}`;
  }
  if (speakerId.startsWith('speaker_')) {
    const num = parseInt(speakerId.replace('speaker_', ''), 10);
    return `Speaker ${String.fromCharCode(65 + num)}`;
  }
  return `Speaker ${speakerId}`;
}

/**
 * Format a single transcript segment
 */
export function formatSegment(segment: TranscriptSegment): string {
  const startTime = formatTimestamp(segment.start);
  const endTime = formatTimestamp(segment.end);
  const speaker = getSpeakerLabel(segment.speaker);

  return `[${speaker}] (${startTime} - ${endTime})\n${segment.text}\n`;
}

/**
 * Format the complete transcript output
 */
export function formatTranscript(
  videoInfo: VideoInfo,
  segments: TranscriptSegment[],
  date: string
): string {
  const separator = '='.repeat(43);
  const header = [
    separator,
    'NEUCA Panel Transcription',
    `Video: ${videoInfo.title}`,
    `URL: ${videoInfo.url}`,
    `Date: ${date}`,
    `Duration: ${formatDuration(videoInfo.duration)}`,
    separator,
    '',
  ].join('\n');

  const body = segments.map(formatSegment).join('\n');

  return header + body;
}

/**
 * Extract video ID from various YouTube URL formats
 */
export function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

/**
 * Validate YouTube URL format
 */
export function isValidYouTubeUrl(url: string): boolean {
  return extractVideoId(url) !== null;
}

/**
 * Generate output filename
 */
export function generateOutputFilename(videoId: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `transcript-${videoId}-${timestamp}.txt`;
}
