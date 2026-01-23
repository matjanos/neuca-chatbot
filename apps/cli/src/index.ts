import { intro, outro, text, select, confirm, isCancel, cancel, log } from '@clack/prompts';
import pc from 'picocolors';

import { displayAsciiArt } from './utils/ascii-art.js';
import { isValidYouTubeUrl } from './utils/format.js';
import { transcribeCommand } from './commands/transcribe.js';
import { identifySpeakersCommand } from './commands/identify-speakers.js';
import { generateEmbeddingsCommand } from './commands/generate-embeddings.js';

async function main() {
  // Display ASCII art logo
  displayAsciiArt();

  // Show intro
  intro(pc.cyan('NEUCA Chatbot CLI'));

  // Main menu selection
  const action = await select({
    message: 'What would you like to do?',
    options: [
      { value: 'transcribe', label: 'Transcribe a YouTube video' },
      { value: 'identify', label: 'Identify speakers in existing transcript' },
      { value: 'embeddings', label: 'Generate embeddings for transcript' },
    ],
  });

  // Handle cancellation
  if (isCancel(action)) {
    cancel('Operation cancelled');
    process.exit(0);
  }

  // Handle speaker identification
  if (action === 'identify') {
    try {
      const outputPath = await identifySpeakersCommand();
      if (outputPath) {
        outro(pc.green(`Identified transcript saved to: ${outputPath}`));
      } else {
        outro(pc.yellow('No changes saved'));
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      cancel(pc.red(`Error: ${errorMessage}`));
      process.exit(1);
    }
    return;
  }

  // Handle embeddings generation
  if (action === 'embeddings') {
    try {
      const datasetId = await generateEmbeddingsCommand();
      if (datasetId) {
        outro(pc.green(`Embeddings generated for dataset: ${datasetId}`));
      } else {
        outro(pc.yellow('No embeddings generated'));
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      cancel(pc.red(`Error: ${errorMessage}`));
      process.exit(1);
    }
    return;
  }

  // Continue with transcription flow
  // Get transcription model selection
  const model = await select({
    message: 'Select transcription model:',
    options: [
      { value: 'assemblyai', label: 'AssemblyAI (speaker diarization)' },
      { value: 'whisper', label: 'Whisper (local) - may be slower on first run' },
    ],
  });

  // Handle cancellation
  if (isCancel(model)) {
    cancel('Operation cancelled');
    process.exit(0);
  }

  // Verify appropriate API key is loaded (only for cloud services)
  if (model === 'assemblyai' && !process.env.ASSEMBLYAI_API_KEY) {
    cancel(pc.red('Error: ASSEMBLYAI_API_KEY not found in environment'));
    console.error(pc.yellow('Please add to .env file: ASSEMBLYAI_API_KEY=your_api_key_here'));
    process.exit(1);
  }

  // For Whisper, no API key needed (runs locally)

  // Get YouTube URL
  const url = await text({
    message: 'Enter a YouTube URL to transcribe:',
    placeholder: 'https://www.youtube.com/watch?v=...',
    validate: (value) => {
      if (!value) {
        return 'Please enter a URL';
      }
      if (!isValidYouTubeUrl(value)) {
        return 'Please enter a valid YouTube URL';
      }
    },
  });

  // Handle cancellation
  if (isCancel(url)) {
    cancel('Operation cancelled');
    process.exit(0);
  }

  // Get language preference
  const language = await select({
    message: 'Select audio language:',
    options: [
      { value: 'pl', label: 'Polish' },
      { value: 'en', label: 'English' },
      { value: 'de', label: 'German' },
      { value: 'pt', label: 'Portuguese' },
      { value: 'uk', label: 'Ukrainian' },
      { value: 'zh', label: 'Chinese' },
      { value: undefined, label: 'Auto-detect' },
    ],
  });

  // Handle cancellation
  if (isCancel(language)) {
    cancel('Operation cancelled');
    process.exit(0);
  }

  try {
    // Run transcription
    const outputPath = await transcribeCommand(
      url,
      model as 'assemblyai' | 'whisper',
      language as string | undefined
    );

    log.success(pc.green(`Transcript saved to: ${outputPath}`));

    // Ask if user wants to identify speakers
    const shouldIdentify = await confirm({
      message: 'Would you like to identify speakers in this transcript?',
    });

    if (!isCancel(shouldIdentify) && shouldIdentify) {
      const identifiedPath = await identifySpeakersCommand(outputPath);
      if (identifiedPath) {
        outro(pc.green(`Identified transcript saved to: ${identifiedPath}`));
      } else {
        outro(pc.yellow('Speaker identification completed (no changes saved)'));
      }
    } else {
      outro(pc.green('Done!'));
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    cancel(pc.red(`Error: ${errorMessage}`));
    process.exit(1);
  }
}

main();
