import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, basename, join } from 'path';
import type { TranscriptOutput, TranscriptSegment, VideoInfo } from '../types.js';

/**
 * Parse timestamp string (HH:MM:SS) to milliseconds
 */
function parseTimestamp(timestamp: string): number {
  const parts = timestamp.split(':').map(Number);
  if (parts.length !== 3) {
    return 0;
  }
  const [hours, minutes, seconds] = parts;
  return ((hours * 3600) + (minutes * 60) + seconds) * 1000;
}

/**
 * Parse duration string (HH:MM:SS or MM:SS) to seconds
 */
function parseDuration(duration: string): number {
  const parts = duration.split(':').map(Number);
  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;
    return (hours * 3600) + (minutes * 60) + seconds;
  } else if (parts.length === 2) {
    const [minutes, seconds] = parts;
    return (minutes * 60) + seconds;
  }
  return 0;
}

/**
 * Parse a transcript file and extract video info and segments
 */
export function parseTranscriptFile(filePath: string): TranscriptOutput | null {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    // Parse header
    let videoTitle = '';
    let videoUrl = '';
    let date = '';
    let duration = 0;
    let headerEndIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.startsWith('Video:')) {
        videoTitle = line.replace('Video:', '').trim();
      } else if (line.startsWith('URL:')) {
        videoUrl = line.replace('URL:', '').trim();
      } else if (line.startsWith('Date:')) {
        date = line.replace('Date:', '').trim();
      } else if (line.startsWith('Duration:')) {
        duration = parseDuration(line.replace('Duration:', '').trim());
      } else if (line.startsWith('=') && i > 0) {
        headerEndIndex = i + 1;
        break;
      }
    }

    // Extract video ID from URL
    const videoId = extractVideoIdFromUrl(videoUrl) || 'unknown';

    // Parse segments
    const segments: TranscriptSegment[] = [];
    let currentSegment: Partial<TranscriptSegment> | null = null;
    let currentText = '';

    // Pattern: [Speaker X] (HH:MM:SS - HH:MM:SS)
    const segmentPattern = /^\[([^\]]+)\]\s*\((\d{2}:\d{2}:\d{2})\s*-\s*(\d{2}:\d{2}:\d{2})\)/;

    for (let i = headerEndIndex; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(segmentPattern);

      if (match) {
        // Save previous segment if exists
        if (currentSegment && currentSegment.speaker) {
          segments.push({
            speaker: currentSegment.speaker,
            text: currentText.trim(),
            start: currentSegment.start!,
            end: currentSegment.end!,
          });
        }

        // Start new segment
        currentSegment = {
          speaker: match[1],
          start: parseTimestamp(match[2]),
          end: parseTimestamp(match[3]),
        };
        currentText = '';
      } else if (currentSegment && line.trim()) {
        // Add text to current segment
        currentText += (currentText ? ' ' : '') + line.trim();
      }
    }

    // Don't forget the last segment
    if (currentSegment && currentSegment.speaker) {
      segments.push({
        speaker: currentSegment.speaker,
        text: currentText.trim(),
        start: currentSegment.start!,
        end: currentSegment.end!,
      });
    }

    const videoInfo: VideoInfo = {
      id: videoId,
      title: videoTitle,
      duration,
      url: videoUrl,
    };

    return {
      videoInfo,
      segments,
      timestamp: date,
    };
  } catch (error) {
    console.error('Error parsing transcript file:', error);
    return null;
  }
}

/**
 * Extract video ID from YouTube URL
 */
function extractVideoIdFromUrl(url: string): string | null {
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
 * Replace speaker names in segments based on mappings
 */
export function replaceSpeakerNames(
  segments: TranscriptSegment[],
  mappings: Map<string, string>
): TranscriptSegment[] {
  return segments.map(segment => {
    // Normalize the speaker label for lookup
    const normalizedLabel = normalizeSpeakerLabel(segment.speaker);
    const newName = mappings.get(normalizedLabel);

    if (newName) {
      return {
        ...segment,
        speaker: newName,
      };
    }
    return segment;
  });
}

/**
 * Normalize speaker label to consistent format
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
  return speaker;
}

/**
 * Generate filename for identified transcript
 */
export function generateIdentifiedFilename(originalPath: string): string {
  const dir = dirname(originalPath);
  const name = basename(originalPath, '.txt');
  return join(dir, `${name}-identified.txt`);
}

/**
 * Format milliseconds to HH:MM:SS format
 */
function formatTimestamp(ms: number): string {
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
function formatDuration(seconds: number): string {
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
 * Write updated transcript to file
 */
export function writeTranscriptFile(
  outputPath: string,
  videoInfo: VideoInfo,
  segments: TranscriptSegment[],
  date: string
): void {
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

  const body = segments.map(segment => {
    const startTime = formatTimestamp(segment.start);
    const endTime = formatTimestamp(segment.end);
    return `[${segment.speaker}] (${startTime} - ${endTime})\n${segment.text}\n`;
  }).join('\n');

  writeFileSync(outputPath, header + body, 'utf-8');
}

/**
 * Get audio file path from transcript path
 * Assumes audio is in temp/ directory with video ID as filename
 */
export function getAudioPathFromTranscript(transcriptPath: string): string | null {
  const parsed = parseTranscriptFile(transcriptPath);
  if (!parsed) {
    return null;
  }

  const videoId = parsed.videoInfo.id;
  if (!videoId || videoId === 'unknown') {
    return null;
  }

  // Construct expected audio path
  const dir = dirname(transcriptPath);
  const tempDir = join(dir, '../temp');
  const audioPath = join(tempDir, `${videoId}.mp3`);

  if (existsSync(audioPath)) {
    return audioPath;
  }

  return null;
}
