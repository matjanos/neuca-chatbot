import { describe, expect, it } from 'bun:test';
import {
  formatTimestamp,
  formatDuration,
  getSpeakerLabel,
  formatSegment,
  extractVideoId,
  isValidYouTubeUrl,
  generateOutputFilename,
} from '../src/utils/format.js';
import type { TranscriptSegment } from '../src/types.js';

describe('formatTimestamp', () => {
  it('should format 0ms as 00:00:00', () => {
    expect(formatTimestamp(0)).toBe('00:00:00');
  });

  it('should format milliseconds to HH:MM:SS', () => {
    expect(formatTimestamp(1000)).toBe('00:00:01');
    expect(formatTimestamp(60000)).toBe('00:01:00');
    expect(formatTimestamp(3600000)).toBe('01:00:00');
  });

  it('should handle complex times', () => {
    expect(formatTimestamp(3661000)).toBe('01:01:01');
    expect(formatTimestamp(7384000)).toBe('02:03:04');
  });
});

describe('formatDuration', () => {
  it('should format seconds to MM:SS for short durations', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(65)).toBe('01:05');
    expect(formatDuration(599)).toBe('09:59');
  });

  it('should format seconds to HH:MM:SS for long durations', () => {
    expect(formatDuration(3600)).toBe('01:00:00');
    expect(formatDuration(3661)).toBe('01:01:01');
  });
});

describe('getSpeakerLabel', () => {
  it('should convert numeric speaker IDs to letters', () => {
    expect(getSpeakerLabel(0)).toBe('Speaker A');
    expect(getSpeakerLabel(1)).toBe('Speaker B');
    expect(getSpeakerLabel(25)).toBe('Speaker Z');
  });

  it('should handle single letter speaker IDs', () => {
    expect(getSpeakerLabel('A')).toBe('Speaker A');
    expect(getSpeakerLabel('B')).toBe('Speaker B');
  });

  it('should handle speaker_ prefixed IDs', () => {
    expect(getSpeakerLabel('speaker_0')).toBe('Speaker A');
    expect(getSpeakerLabel('speaker_1')).toBe('Speaker B');
  });

  it('should pass through other string IDs', () => {
    expect(getSpeakerLabel('John')).toBe('Speaker John');
  });
});

describe('formatSegment', () => {
  it('should format a segment with speaker and timestamps', () => {
    const segment: TranscriptSegment = {
      speaker: '0',
      text: 'Hello, world!',
      start: 0,
      end: 5000,
    };

    const result = formatSegment(segment);
    expect(result).toContain('[Speaker 0]');
    expect(result).toContain('(00:00:00 - 00:00:05)');
    expect(result).toContain('Hello, world!');
  });
});

describe('extractVideoId', () => {
  it('should extract video ID from standard YouTube URL', () => {
    expect(extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ'
    );
  });

  it('should extract video ID from short YouTube URL', () => {
    expect(extractVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('should extract video ID from embed URL', () => {
    expect(extractVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ'
    );
  });

  it('should extract video ID from URL with additional parameters', () => {
    expect(
      extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s')
    ).toBe('dQw4w9WgXcQ');
  });

  it('should handle raw video IDs', () => {
    expect(extractVideoId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('should return null for invalid URLs', () => {
    expect(extractVideoId('https://example.com/video')).toBeNull();
    expect(extractVideoId('not a url')).toBeNull();
  });
});

describe('isValidYouTubeUrl', () => {
  it('should return true for valid YouTube URLs', () => {
    expect(isValidYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      true
    );
    expect(isValidYouTubeUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(true);
    expect(isValidYouTubeUrl('dQw4w9WgXcQ')).toBe(true);
  });

  it('should return false for invalid URLs', () => {
    expect(isValidYouTubeUrl('https://example.com/video')).toBe(false);
    expect(isValidYouTubeUrl('')).toBe(false);
  });
});

describe('generateOutputFilename', () => {
  it('should generate filename with video ID and timestamp', () => {
    const filename = generateOutputFilename('dQw4w9WgXcQ');
    expect(filename).toMatch(/^transcript-dQw4w9WgXcQ-\d{4}-\d{2}-\d{2}T.*\.txt$/);
  });
});
