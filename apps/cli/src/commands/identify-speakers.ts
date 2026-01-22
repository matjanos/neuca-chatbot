import {
  spinner,
  select,
  text,
  confirm,
  isCancel,
  cancel,
  note,
  log,
} from '@clack/prompts';
import pc from 'picocolors';
import { readdirSync, existsSync } from 'fs';
import { join, resolve, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

import type { SpeakerInfo, AudioSample } from '../types.js';
import { analyzeSpeakers, selectSamplesForSpeaker, formatSpeakerDuration } from '../services/speaker-analyzer.js';
import {
  playSegment,
  stopPlayback,
  cleanupSegmentFiles,
  checkFFmpegAvailable,
  checkAfplayAvailable,
} from '../services/audio-playback.js';
import {
  parseTranscriptFile,
  replaceSpeakerNames,
  generateIdentifiedFilename,
  writeTranscriptFile,
  getAudioPathFromTranscript,
} from '../utils/transcript-io.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * List available transcript files in the output directory
 */
function listTranscriptFiles(): { value: string; label: string }[] {
  const outputDir = resolve(__dirname, '../../../../output');

  if (!existsSync(outputDir)) {
    return [];
  }

  const files = readdirSync(outputDir)
    .filter(f => f.startsWith('transcript-') && f.endsWith('.txt') && !f.includes('-identified'))
    .sort((a, b) => b.localeCompare(a)); // Newest first

  return files.map(f => ({
    value: join(outputDir, f),
    label: f,
  }));
}

/**
 * Format timestamp for display
 */
function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Main speaker identification command
 */
export async function identifySpeakersCommand(
  transcriptPath?: string,
  audioPath?: string
): Promise<string | null> {
  const s = spinner();

  // Check dependencies
  s.start('Checking audio playback dependencies...');
  const hasFFmpeg = await checkFFmpegAvailable();
  const hasAfplay = await checkAfplayAvailable();

  if (!hasFFmpeg) {
    s.stop(pc.red('ffmpeg not found'));
    log.error('Please install ffmpeg: brew install ffmpeg');
    return null;
  }

  if (!hasAfplay) {
    s.stop(pc.red('afplay not found'));
    log.error('afplay is required for audio playback (macOS only)');
    return null;
  }
  s.stop('Audio playback dependencies ready');

  // Select transcript if not provided
  if (!transcriptPath) {
    const transcripts = listTranscriptFiles();

    if (transcripts.length === 0) {
      log.error('No transcript files found in output/ directory');
      log.info('Run a transcription first to create transcript files');
      return null;
    }

    const selected = await select({
      message: 'Select a transcript to identify speakers:',
      options: transcripts,
    });

    if (isCancel(selected)) {
      cancel('Operation cancelled');
      return null;
    }

    transcriptPath = selected as string;
  }

  // Parse transcript
  s.start('Loading transcript...');
  const transcript = parseTranscriptFile(transcriptPath);

  if (!transcript) {
    s.stop(pc.red('Failed to parse transcript'));
    return null;
  }

  if (transcript.segments.length === 0) {
    s.stop(pc.red('No segments found in transcript'));
    return null;
  }
  s.stop(`Loaded ${transcript.segments.length} segments`);

  // Find audio file if not provided
  if (!audioPath) {
    audioPath = getAudioPathFromTranscript(transcriptPath) || undefined;

    if (!audioPath) {
      log.warn('Audio file not found. You can still identify speakers without playback.');
      const proceed = await confirm({
        message: 'Continue without audio playback?',
      });

      if (isCancel(proceed) || !proceed) {
        cancel('Operation cancelled');
        return null;
      }
    }
  }

  // Analyze speakers
  s.start('Analyzing speakers...');
  const speakers = analyzeSpeakers(transcript.segments);
  s.stop(`Found ${speakers.length} speakers`);

  // Collect speaker name mappings
  const speakerMappings = new Map<string, string>();

  // Helper to build speaker list options
  function buildSpeakerOptions() {
    const speakerOptions = speakers.map(sp => {
      const assignedName = speakerMappings.get(sp.normalizedLabel);
      const status = assignedName ? pc.green(`[${assignedName}]`) : pc.dim('(not identified)');
      return {
        value: sp.normalizedLabel,
        label: `Speaker ${sp.normalizedLabel} - ${sp.segmentCount} segments, ${formatSpeakerDuration(sp.totalDuration)} ${status}`,
      };
    });

    return [
      ...speakerOptions,
      { value: '_save', label: pc.green('Save and exit') },
      { value: '_quit', label: pc.yellow('Quit without saving') },
    ];
  }

  // Main speaker selection loop
  while (true) {
    const selectedSpeaker = await select({
      message: 'Select a speaker to identify:',
      options: buildSpeakerOptions(),
    });

    if (isCancel(selectedSpeaker)) {
      cleanupSegmentFiles();
      cancel('Operation cancelled');
      return null;
    }

    if (selectedSpeaker === '_quit') {
      cleanupSegmentFiles();
      cancel('Operation cancelled');
      return null;
    }

    if (selectedSpeaker === '_save') {
      break;
    }

    // Find the selected speaker
    const speaker = speakers.find(sp => sp.normalizedLabel === selectedSpeaker);
    if (!speaker) continue;

    log.message('');
    log.info(pc.bold(`Speaker ${speaker.normalizedLabel}`));
    log.info(`  ${speaker.segmentCount} segments, ${formatSpeakerDuration(speaker.totalDuration)} total speaking time`);

    // Get audio samples
    const samples = selectSamplesForSpeaker(speaker);

    // Play samples if audio is available
    if (audioPath && samples.length > 0) {
      let currentSampleIndex = 0;

      while (true) {
        const sample = samples[currentSampleIndex];
        log.info(`  Sample ${currentSampleIndex + 1}/${samples.length}: ${formatTime(sample.start)} - ${formatTime(sample.end)}`);
        log.info(pc.dim(`  "${sample.text.substring(0, 100)}${sample.text.length > 100 ? '...' : ''}"`));

        // Play the sample
        try {
          const sampleId = `${speaker.normalizedLabel}-${currentSampleIndex}`;
          await playSegment(audioPath, sample.start, sample.end, sampleId);
        } catch (error) {
          log.warn(`Could not play audio sample: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        // Ask what to do next
        const action = await select({
          message: `What would you like to do for Speaker ${speaker.normalizedLabel}?`,
          options: [
            { value: 'name', label: 'Enter name for this speaker' },
            { value: 'replay', label: 'Replay this sample' },
            ...(currentSampleIndex > 0 ? [{ value: 'prev', label: 'Play previous sample' }] : []),
            ...(currentSampleIndex < samples.length - 1 ? [{ value: 'next', label: 'Play next sample' }] : []),
            { value: 'back', label: 'Back to speaker list' },
          ],
        });

        if (isCancel(action)) {
          cleanupSegmentFiles();
          cancel('Operation cancelled');
          return null;
        }

        if (action === 'back') {
          break;
        }

        if (action === 'replay') {
          continue;
        }

        if (action === 'prev') {
          currentSampleIndex = Math.max(0, currentSampleIndex - 1);
          continue;
        }

        if (action === 'next') {
          currentSampleIndex = Math.min(samples.length - 1, currentSampleIndex + 1);
          continue;
        }

        if (action === 'name') {
          const name = await text({
            message: `Enter name for Speaker ${speaker.normalizedLabel}:`,
            placeholder: 'e.g., John Smith, Host, Guest',
            validate: (value) => {
              if (!value || !value.trim()) {
                return 'Please enter a name';
              }
            },
          });

          if (isCancel(name)) {
            cleanupSegmentFiles();
            cancel('Operation cancelled');
            return null;
          }

          speakerMappings.set(speaker.normalizedLabel, name as string);
          log.success(`Speaker ${speaker.normalizedLabel} -> ${name}`);
          break;
        }
      }
    } else {
      // No audio available, just ask for name
      const name = await text({
        message: `Enter name for Speaker ${speaker.normalizedLabel}:`,
        placeholder: 'e.g., John Smith, Host, Guest (or leave empty to skip)',
      });

      if (isCancel(name)) {
        cleanupSegmentFiles();
        cancel('Operation cancelled');
        return null;
      }

      if (name && (name as string).trim()) {
        speakerMappings.set(speaker.normalizedLabel, name as string);
        log.success(`Speaker ${speaker.normalizedLabel} -> ${name}`);
      }
    }
  }

  // Clean up temp files
  cleanupSegmentFiles();

  // Check if any mappings were made
  if (speakerMappings.size === 0) {
    log.info('No speaker names were assigned');
    return null;
  }

  // Show summary of mappings
  const mappingLines = Array.from(speakerMappings.entries())
    .map(([label, name]) => `  Speaker ${label} -> ${name}`);
  note(mappingLines.join('\n'), 'Speaker mappings');

  // Confirm save
  const shouldSave = await confirm({
    message: 'Save transcript with identified speakers?',
  });

  if (isCancel(shouldSave) || !shouldSave) {
    cancel('Operation cancelled');
    return null;
  }

  // Apply mappings and save
  s.start('Saving identified transcript...');

  const updatedSegments = replaceSpeakerNames(transcript.segments, speakerMappings);
  const outputPath = generateIdentifiedFilename(transcriptPath);

  writeTranscriptFile(
    outputPath,
    transcript.videoInfo,
    updatedSegments,
    transcript.timestamp
  );

  s.stop(`Transcript saved to: ${basename(outputPath)}`);

  return outputPath;
}
