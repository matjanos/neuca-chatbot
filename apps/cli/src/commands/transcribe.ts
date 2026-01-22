import { spinner } from '@clack/prompts';
import { mkdirSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import {
  ensureYtDlpInstalled,
  getVideoInfo,
  downloadAudio,
} from '../services/youtube.js';
import { transcribeAudio } from '../services/transcription.js';
import { transcribeAudioOpenAI } from '../services/transcription-openai.js';
import {
  formatTranscript,
  generateOutputFilename,
  extractVideoId,
} from '../utils/format.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Execute the full transcription workflow
 */
export async function transcribeCommand(
  url: string,
  model: 'assemblyai' | 'openai',
  language?: string
): Promise<string> {
  const s = spinner();

  // Ensure yt-dlp is installed
  s.start('Checking yt-dlp installation...');
  try {
    await ensureYtDlpInstalled();
    s.stop('yt-dlp ready');
  } catch (error) {
    s.stop('Failed to setup yt-dlp');
    throw error;
  }

  // Get video information
  s.start('Fetching video information...');
  let videoInfo;
  try {
    videoInfo = await getVideoInfo(url);
    s.stop(`Video: ${videoInfo.title}`);
  } catch (error) {
    s.stop('Failed to fetch video information');
    throw error;
  }

  // Create temp directory for downloads
  const tempDir = resolve(__dirname, '../../../../temp');
  if (!existsSync(tempDir)) {
    mkdirSync(tempDir, { recursive: true });
  }

  // Download audio (or use cached)
  const audioPath = join(tempDir, `${videoInfo.id}`);
  s.start('Checking for cached audio...');
  let audioFilePath: string;
  let wasCached: boolean;
  try {
    const result = await downloadAudio(url, audioPath);
    audioFilePath = result.audioPath;
    wasCached = result.wasCached;
    if (wasCached) {
      s.stop('Using cached audio');
    } else {
      s.stop('Audio downloaded');
    }
  } catch (error) {
    s.stop('Failed to download audio');
    throw error;
  }

  // Transcribe audio
  const langMsg = language ? ` (language: ${language})` : ' (auto-detect)';
  const modelName = model === 'assemblyai' ? 'AssemblyAI' : 'OpenAI gpt-4o-transcribe-diarize';
  s.start(`Transcribing audio with ${modelName}${langMsg} - this may take a while...`);
  let transcriptionResult;
  try {
    if (model === 'openai') {
      transcriptionResult = await transcribeAudioOpenAI(audioFilePath, language);
    } else {
      transcriptionResult = await transcribeAudio(audioFilePath, language);
    }
    s.stop(`Transcription complete (${transcriptionResult.segments.length} segments)`);
  } catch (error) {
    s.stop('Failed to transcribe audio');
    throw error;
  }

  // Format and save transcript
  const outputDir = resolve(__dirname, '../../../../output');
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const date = new Date().toISOString().split('T')[0];
  const transcript = formatTranscript(
    videoInfo,
    transcriptionResult.segments,
    date
  );

  const outputFilename = generateOutputFilename(videoInfo.id);
  const outputPath = join(outputDir, outputFilename);

  writeFileSync(outputPath, transcript, 'utf-8');

  return outputPath;
}
