import { spawn, type Subprocess } from 'bun';
import { existsSync, mkdirSync, unlinkSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Store current playback process for cleanup
let currentPlaybackProcess: Subprocess | null = null;
let segmentFiles: string[] = [];

/**
 * Get the path to the segments temp directory
 */
function getSegmentsDir(): string {
  const tempDir = join(__dirname, '../../../../temp/segments');
  if (!existsSync(tempDir)) {
    mkdirSync(tempDir, { recursive: true });
  }
  return tempDir;
}

/**
 * Convert milliseconds to ffmpeg time format (HH:MM:SS.mmm)
 */
function msToFFmpegTime(ms: number): string {
  const totalSeconds = ms / 1000;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toFixed(3).padStart(6, '0')}`;
}

/**
 * Extract an audio segment using ffmpeg
 */
export async function extractAudioSegment(
  sourcePath: string,
  startMs: number,
  endMs: number,
  sampleId: string
): Promise<string> {
  const segmentsDir = getSegmentsDir();
  const outputPath = join(segmentsDir, `segment-${sampleId}.mp3`);

  // Skip if already extracted
  if (existsSync(outputPath)) {
    return outputPath;
  }

  const startTime = msToFFmpegTime(startMs);
  const endTime = msToFFmpegTime(endMs);

  const process = spawn([
    'ffmpeg',
    '-y',
    '-i', sourcePath,
    '-ss', startTime,
    '-to', endTime,
    '-c', 'copy',
    outputPath,
  ], {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const exitCode = await process.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(process.stderr).text();
    throw new Error(`ffmpeg failed: ${stderr}`);
  }

  segmentFiles.push(outputPath);
  return outputPath;
}

/**
 * Play an audio file using afplay (macOS)
 */
export async function playAudio(audioPath: string): Promise<void> {
  // Stop any currently playing audio
  stopPlayback();

  if (!existsSync(audioPath)) {
    throw new Error(`Audio file not found: ${audioPath}`);
  }

  currentPlaybackProcess = spawn(['afplay', audioPath], {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const exitCode = await currentPlaybackProcess.exited;
  currentPlaybackProcess = null;

  // Exit code 1 typically means playback was interrupted (which is fine)
  if (exitCode !== 0 && exitCode !== 1) {
    throw new Error(`afplay failed with exit code ${exitCode}`);
  }
}

/**
 * Extract and play a segment from the source audio
 */
export async function playSegment(
  sourcePath: string,
  startMs: number,
  endMs: number,
  sampleId: string
): Promise<void> {
  const segmentPath = await extractAudioSegment(sourcePath, startMs, endMs, sampleId);
  await playAudio(segmentPath);
}

/**
 * Stop currently playing audio
 */
export function stopPlayback(): void {
  if (currentPlaybackProcess) {
    try {
      currentPlaybackProcess.kill();
    } catch {
      // Ignore errors when killing process
    }
    currentPlaybackProcess = null;
  }
}

/**
 * Clean up extracted segment files
 */
export function cleanupSegmentFiles(): void {
  stopPlayback();

  for (const file of segmentFiles) {
    try {
      if (existsSync(file)) {
        unlinkSync(file);
      }
    } catch {
      // Ignore cleanup errors
    }
  }
  segmentFiles = [];

  // Try to remove the segments directory if empty
  try {
    const segmentsDir = getSegmentsDir();
    const remaining = readdirSync(segmentsDir);
    if (remaining.length === 0) {
      // Directory is empty, could remove it but leave it for now
    }
  } catch {
    // Ignore
  }
}

/**
 * Check if ffmpeg is available
 */
export async function checkFFmpegAvailable(): Promise<boolean> {
  try {
    const process = spawn(['ffmpeg', '-version'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const exitCode = await process.exited;
    return exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Check if afplay is available (macOS)
 */
export async function checkAfplayAvailable(): Promise<boolean> {
  try {
    const process = spawn(['which', 'afplay'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const exitCode = await process.exited;
    return exitCode === 0;
  } catch {
    return false;
  }
}
