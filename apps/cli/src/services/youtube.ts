import { YtDlp, helpers, BIN_DIR } from 'ytdlp-nodejs';
import { existsSync } from 'fs';
import { join } from 'path';
import type { VideoInfo } from '../types.js';
import { extractVideoId } from '../utils/format.js';

let ytdlp: YtDlp | null = null;

/**
 * Get or create the YtDlp instance
 */
function getYtDlp(): YtDlp {
  if (!ytdlp) {
    const binaryPath = helpers.findYtdlpBinary();
    if (binaryPath) {
      ytdlp = new YtDlp({ binaryPath });
    } else {
      ytdlp = new YtDlp();
    }
  }
  return ytdlp;
}

/**
 * Ensure yt-dlp binary is installed
 */
export async function ensureYtDlpInstalled(): Promise<void> {
  // First try to find existing binary
  let binaryPath = helpers.findYtdlpBinary();

  if (!binaryPath) {
    // Download yt-dlp binary
    binaryPath = await helpers.downloadYtDlp(BIN_DIR);
  }

  // Create YtDlp instance with the binary path
  ytdlp = new YtDlp({ binaryPath });

  // Verify the installation works
  const isInstalled = await ytdlp.checkInstallationAsync();
  if (!isInstalled) {
    throw new Error('yt-dlp installation verification failed');
  }
}

/**
 * Get video information from YouTube URL
 */
export async function getVideoInfo(url: string): Promise<VideoInfo> {
  const info = await getYtDlp().getInfoAsync<'video'>(url);

  const videoId = extractVideoId(url);
  if (!videoId) {
    throw new Error('Could not extract video ID from URL');
  }

  return {
    id: videoId,
    title: info.title || 'Unknown Title',
    duration: info.duration || 0,
    url: url,
  };
}

/**
 * Download audio from YouTube video with caching
 * Returns the path to the downloaded audio file
 */
export async function downloadAudio(
  url: string,
  outputPath: string
): Promise<{ audioPath: string; wasCached: boolean }> {
  // Use WAV format for better compatibility with both AssemblyAI and OpenAI
  const wavPath = outputPath.endsWith('.wav') ? outputPath : `${outputPath}.wav`;

  // Check if file already exists (cached)
  if (existsSync(wavPath)) {
    return { audioPath: wavPath, wasCached: true };
  }

  // Download and extract audio as WAV
  await getYtDlp().downloadAsync(url, {
    output: outputPath, // yt-dlp will add .wav extension
    extractAudio: true,
    audioFormat: 'wav',
    audioQuality: '0', // Best quality
  });

  return { audioPath: wavPath, wasCached: false };
}
