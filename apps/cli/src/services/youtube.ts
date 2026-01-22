import { YtDlp, helpers, BIN_DIR } from 'ytdlp-nodejs';
import { existsSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';
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
  // Use MP3 format for better compatibility with OpenAI
  const mp3Path = outputPath.endsWith('.mp3') ? outputPath : `${outputPath}.mp3`;

  // Check if file already exists (cached)
  if (existsSync(mp3Path)) {
    return { audioPath: mp3Path, wasCached: true };
  }

  // Download and extract audio as MP3
  await getYtDlp().downloadAsync(url, {
    output: outputPath, // yt-dlp will add .mp3 extension
    extractAudio: true,
    audioFormat: 'mp3',
    audioQuality: '0', // Best quality
  });

  return { audioPath: mp3Path, wasCached: false };
}

/**
 * Compress audio file to fit OpenAI's 25MB limit
 * Uses lower bitrate optimized for speech recognition
 */
export async function compressAudioForOpenAI(
  inputPath: string
): Promise<string> {
  const stats = statSync(inputPath);
  const fileSizeMB = stats.size / (1024 * 1024);

  // If file is already under 25MB, no compression needed
  if (fileSizeMB < 25) {
    return inputPath;
  }

  // Create compressed file path
  const compressedPath = inputPath.replace('.mp3', '-compressed.mp3');

  // If compressed version already exists and is under 25MB, use it
  if (existsSync(compressedPath)) {
    const compressedStats = statSync(compressedPath);
    const compressedSizeMB = compressedStats.size / (1024 * 1024);
    if (compressedSizeMB < 25) {
      console.log(`Using cached compressed audio (${compressedSizeMB.toFixed(1)}MB)`);
      return compressedPath;
    }
    // If cached version is still too large, delete and re-compress with lower bitrate
    unlinkSync(compressedPath);
  }

  console.log(`Compressing audio (${fileSizeMB.toFixed(1)}MB → <25MB)...`);

  // Calculate target bitrate to ensure we stay under 25MB
  // Get audio duration from ffprobe first
  const duration = await getAudioDuration(inputPath);

  // Target 24MB to have safety margin (25MB * 0.96)
  // Bitrate (kbps) = (target size in MB * 8192) / duration in seconds
  const targetSizeMB = 24;
  const targetBitrate = Math.floor((targetSizeMB * 8192) / duration);

  // Clamp bitrate between 24kbps (minimum acceptable) and 64kbps (maximum needed)
  const bitrate = Math.max(24, Math.min(64, targetBitrate));

  console.log(`Using ${bitrate}kbps bitrate for ${duration.toFixed(0)}s audio`);

  // Use ffmpeg to compress with settings optimized for speech:
  // - Calculated bitrate to fit under 25MB
  // - Mono (speech doesn't need stereo)
  // - 16kHz sample rate (sufficient for speech recognition)
  await new Promise<void>((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-i', inputPath,
      '-ac', '1',              // Mono
      '-ar', '16000',          // 16kHz sample rate
      '-b:a', `${bitrate}k`,   // Calculated bitrate
      '-y',                    // Overwrite output file
      compressedPath
    ]);

    let errorOutput = '';

    ffmpeg.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        const compressedStats = statSync(compressedPath);
        const compressedSizeMB = compressedStats.size / (1024 * 1024);
        console.log(`Compressed to ${compressedSizeMB.toFixed(1)}MB`);

        // Validate size
        if (compressedSizeMB >= 25) {
          reject(new Error(`Compressed file is still ${compressedSizeMB.toFixed(1)}MB, exceeds 25MB limit`));
          return;
        }

        resolve();
      } else {
        reject(new Error(`ffmpeg failed with code ${code}: ${errorOutput}`));
      }
    });

    ffmpeg.on('error', (err) => {
      reject(new Error(`Failed to spawn ffmpeg: ${err.message}`));
    });
  });

  return compressedPath;
}

/**
 * Get audio duration in seconds using ffprobe
 */
async function getAudioDuration(audioPath: string): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      audioPath
    ]);

    let output = '';

    ffprobe.stdout.on('data', (data) => {
      output += data.toString();
    });

    ffprobe.on('close', (code) => {
      if (code === 0) {
        const duration = parseFloat(output.trim());
        resolve(duration);
      } else {
        reject(new Error(`ffprobe failed with code ${code}`));
      }
    });

    ffprobe.on('error', (err) => {
      reject(new Error(`Failed to spawn ffprobe: ${err.message}`));
    });
  });
}
