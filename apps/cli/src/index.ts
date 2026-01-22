import { intro, outro, text, select, isCancel, cancel } from '@clack/prompts';
import pc from 'picocolors';

import { displayAsciiArt } from './utils/ascii-art.js';
import { isValidYouTubeUrl } from './utils/format.js';
import { transcribeCommand } from './commands/transcribe.js';

async function main() {
  // Display ASCII art logo
  displayAsciiArt();

  // Show intro
  intro(pc.cyan('NEUCA Chatbot CLI'));

  // Get transcription model selection
  const model = await select({
    message: 'Select transcription model:',
    options: [
      { value: 'assemblyai', label: 'AssemblyAI (speaker diarization)' },
      { value: 'openai', label: 'OpenAI gpt-4o-transcribe-diarize' },
    ],
  });

  // Handle cancellation
  if (isCancel(model)) {
    cancel('Operation cancelled');
    process.exit(0);
  }

  // Verify appropriate API key is loaded
  if (model === 'assemblyai' && !process.env.ASSEMBLYAI_API_KEY) {
    cancel(pc.red('Error: ASSEMBLYAI_API_KEY not found in environment'));
    console.error(pc.yellow('Please add to .env file: ASSEMBLYAI_API_KEY=your_api_key_here'));
    process.exit(1);
  }

  if (model === 'openai' && !process.env.OPENAI_API_KEY) {
    cancel(pc.red('Error: OPENAI_API_KEY not found in environment'));
    console.error(pc.yellow('Please add to .env file: OPENAI_API_KEY=your_api_key_here'));
    process.exit(1);
  }

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
      model as 'assemblyai' | 'openai',
      language as string | undefined
    );

    // Show success message
    outro(pc.green(`Transcript saved to: ${outputPath}`));
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    cancel(pc.red(`Error: ${errorMessage}`));
    process.exit(1);
  }
}

main();
