import { describe, expect, it } from 'bun:test';
import { extractVideoId, isValidYouTubeUrl } from '../src/utils/format.js';

describe('YouTube URL Validation', () => {
  describe('extractVideoId', () => {
    it('should extract video ID from standard watch URL', () => {
      expect(
        extractVideoId('https://www.youtube.com/watch?v=Ya5Cg9qRspg')
      ).toBe('Ya5Cg9qRspg');
    });

    it('should extract video ID from mobile URL', () => {
      expect(extractVideoId('https://m.youtube.com/watch?v=Ya5Cg9qRspg')).toBe(
        'Ya5Cg9qRspg'
      );
    });

    it('should extract video ID from short URL', () => {
      expect(extractVideoId('https://youtu.be/Ya5Cg9qRspg')).toBe('Ya5Cg9qRspg');
    });

    it('should extract video ID from embed URL', () => {
      expect(
        extractVideoId('https://www.youtube.com/embed/Ya5Cg9qRspg')
      ).toBe('Ya5Cg9qRspg');
    });

    it('should extract video ID from v/ URL format', () => {
      expect(extractVideoId('https://www.youtube.com/v/Ya5Cg9qRspg')).toBe(
        'Ya5Cg9qRspg'
      );
    });

    it('should handle URLs with timestamps', () => {
      expect(
        extractVideoId('https://www.youtube.com/watch?v=Ya5Cg9qRspg&t=120')
      ).toBe('Ya5Cg9qRspg');
      expect(extractVideoId('https://youtu.be/Ya5Cg9qRspg?t=120')).toBe(
        'Ya5Cg9qRspg'
      );
    });

    it('should handle URLs with playlist parameters', () => {
      expect(
        extractVideoId(
          'https://www.youtube.com/watch?v=Ya5Cg9qRspg&list=PLxxxxxx'
        )
      ).toBe('Ya5Cg9qRspg');
    });

    it('should handle video ID with underscores and hyphens', () => {
      expect(extractVideoId('https://youtu.be/a1b2c3_d-ef')).toBe('a1b2c3_d-ef');
    });

    it('should return null for non-YouTube URLs', () => {
      expect(extractVideoId('https://vimeo.com/123456789')).toBeNull();
      expect(extractVideoId('https://example.com/video')).toBeNull();
    });

    it('should return null for invalid video IDs', () => {
      expect(extractVideoId('https://youtube.com/watch?v=')).toBeNull();
      expect(extractVideoId('https://youtube.com/watch?v=short')).toBeNull();
    });

    it('should handle raw 11-character video IDs', () => {
      expect(extractVideoId('Ya5Cg9qRspg')).toBe('Ya5Cg9qRspg');
    });
  });

  describe('isValidYouTubeUrl', () => {
    it('should return true for valid standard URL', () => {
      expect(
        isValidYouTubeUrl('https://www.youtube.com/watch?v=Ya5Cg9qRspg')
      ).toBe(true);
    });

    it('should return true for valid short URL', () => {
      expect(isValidYouTubeUrl('https://youtu.be/Ya5Cg9qRspg')).toBe(true);
    });

    it('should return true for valid embed URL', () => {
      expect(
        isValidYouTubeUrl('https://www.youtube.com/embed/Ya5Cg9qRspg')
      ).toBe(true);
    });

    it('should return true for raw video ID', () => {
      expect(isValidYouTubeUrl('Ya5Cg9qRspg')).toBe(true);
    });

    it('should return false for invalid URLs', () => {
      expect(isValidYouTubeUrl('https://vimeo.com/123456789')).toBe(false);
      expect(isValidYouTubeUrl('not-a-url')).toBe(false);
      expect(isValidYouTubeUrl('')).toBe(false);
    });

    it('should return false for URLs with invalid video IDs', () => {
      expect(isValidYouTubeUrl('https://youtube.com/watch?v=short')).toBe(false);
    });
  });
});
