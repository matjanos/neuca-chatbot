import { spawn } from 'child_process';
import { existsSync, writeFileSync, readFileSync, unlinkSync, mkdirSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import type { TranscriptionResult, TranscriptSegment } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to virtual environment
const VENV_DIR = resolve(__dirname, '../../../../.venv-whisper');

/**
 * Get the Python executable from virtual environment
 */
function getVenvPython(): string {
  return join(VENV_DIR, 'bin', 'python3');
}

/**
 * Check if we're on Apple Silicon Mac
 */
function isAppleSilicon(): boolean {
  const os = require('os');
  return os.platform() === 'darwin' && os.arch() === 'arm64';
}

/**
 * Check if mlx-whisper (for Apple Silicon) or openai-whisper is installed
 */
async function isWhisperInstalled(): Promise<boolean> {
  if (!existsSync(VENV_DIR)) {
    return false;
  }

  // Check for mlx-whisper on Apple Silicon, otherwise openai-whisper
  const packageName = isAppleSilicon() ? 'mlx_whisper' : 'whisper';

  const whisperInstalled = await new Promise<boolean>((resolve) => {
    const python = spawn(getVenvPython(), ['-c', `import ${packageName}`]);

    python.on('close', (code) => {
      resolve(code === 0);
    });

    python.on('error', () => {
      resolve(false);
    });
  });

  if (!whisperInstalled) {
    return false;
  }

  // Also check for pyannote.audio
  const pyanoteInstalled = await new Promise<boolean>((resolve) => {
    const python = spawn(getVenvPython(), ['-c', 'import pyannote.audio']);

    python.on('close', (code) => {
      resolve(code === 0);
    });

    python.on('error', () => {
      resolve(false);
    });
  });

  return pyanoteInstalled;
}

/**
 * Create virtual environment
 */
async function createVirtualEnv(): Promise<void> {
  console.log('Creating Python virtual environment...');

  return new Promise<void>((resolve, reject) => {
    const venv = spawn('python3', ['-m', 'venv', VENV_DIR], {
      stdio: 'inherit',
    });

    venv.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error('Failed to create virtual environment'));
      }
    });

    venv.on('error', (err) => {
      reject(new Error(`Failed to create venv: ${err.message}`));
    });
  });
}

/**
 * Install whisper (mlx-whisper on Apple Silicon, openai-whisper elsewhere)
 */
async function installWhisperInVenv(): Promise<void> {
  const isM1Mac = isAppleSilicon();

  if (isM1Mac) {
    console.log('Installing mlx-whisper and pyannote.audio for Apple Silicon (this may take a few minutes)...');

    return new Promise<void>((resolve, reject) => {
      const pip = spawn(
        getVenvPython(),
        ['-m', 'pip', 'install', 'mlx-whisper', 'pyannote.audio'],
        {
          stdio: 'inherit',
        }
      );

      pip.on('close', (code) => {
        if (code === 0) {
          console.log('✓ mlx-whisper and pyannote.audio installed successfully!');
          console.log('✓ Will use Apple Metal GPU acceleration + speaker diarization');
          resolve();
        } else {
          reject(new Error('Failed to install mlx-whisper and pyannote.audio'));
        }
      });

      pip.on('error', (err) => {
        reject(new Error(`Failed to run pip: ${err.message}`));
      });
    });
  } else {
    console.log('Installing openai-whisper, PyTorch, and pyannote.audio (this may take a few minutes)...');

    return new Promise<void>((resolve, reject) => {
      const pip = spawn(
        getVenvPython(),
        ['-m', 'pip', 'install', 'openai-whisper', 'torch', 'torchvision', 'torchaudio', 'pyannote.audio'],
        {
          stdio: 'inherit',
        }
      );

      pip.on('close', (code) => {
        if (code === 0) {
          console.log('✓ openai-whisper, PyTorch, and pyannote.audio installed successfully!');
          console.log('Note: PyTorch will automatically use GPU if available (CUDA)');
          console.log('Note: Speaker diarization requires HF_TOKEN in .env');
          resolve();
        } else {
          reject(new Error('Failed to install openai-whisper and dependencies'));
        }
      });

      pip.on('error', (err) => {
        reject(new Error(`Failed to run pip: ${err.message}`));
      });
    });
  }
}

/**
 * Check if openai-whisper is installed, and set up virtual environment if not
 */
export async function ensureWhisperInstalled(): Promise<void> {
  // Check if already installed in venv
  const installed = await isWhisperInstalled();

  if (installed) {
    return;
  }

  // Create venv if it doesn't exist
  if (!existsSync(VENV_DIR)) {
    await createVirtualEnv();
  }

  // Install openai-whisper in venv
  await installWhisperInVenv();
}

/**
 * Transcribe audio file using local Whisper (openai-whisper)
 * Supports GPU acceleration (Metal on Mac, CUDA on NVIDIA)
 */
export async function transcribeAudioWhisper(
  audioPath: string,
  language?: string
): Promise<TranscriptionResult> {
  // Create a temporary Python script for transcription
  const tempDir = join(dirname(__dirname), '../../../temp');
  const scriptPath = join(tempDir, 'whisper_transcribe.py');
  const outputPath = join(tempDir, 'whisper_output.json');

  // Remove old output if exists
  if (existsSync(outputPath)) {
    unlinkSync(outputPath);
  }

  // Determine which whisper implementation to use
  const useMLX = isAppleSilicon();

  // Python script - different implementation for Apple Silicon (mlx) vs others (openai-whisper)
  const pythonScript = useMLX ? `
import sys
import json
import mlx_whisper
import os
from pyannote.audio import Pipeline

# Use MLX Whisper for Apple Silicon (native Metal GPU support)
audio_path = sys.argv[1]
language = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] != "undefined" else None
hf_token = os.environ.get("HF_TOKEN")

print("=" * 60, file=sys.stderr)
print("✓ USING APPLE METAL GPU (via MLX framework)", file=sys.stderr)
print("  Performance: ~7-10x faster than real-time", file=sys.stderr)
print("=" * 60, file=sys.stderr)

# Step 1: Transcribe with Whisper
print("Loading Whisper model...", file=sys.stderr)
result = mlx_whisper.transcribe(
    audio_path,
    path_or_hf_repo="mlx-community/whisper-large-v3-mlx",
    language=language,
    verbose=True
)

print("\\nTranscription complete! Starting speaker diarization...", file=sys.stderr)

# Step 2: Speaker diarization with pyannote
if not hf_token:
    print("⚠ Warning: HF_TOKEN not found. Skipping speaker diarization.", file=sys.stderr)
    print("⚠ All segments will be labeled as 'Speaker A'.", file=sys.stderr)
    print("⚠ Get a token at https://huggingface.co/settings/tokens", file=sys.stderr)
    diarization = None
else:
    try:
        pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1",
            use_auth_token=hf_token
        )
        diarization = pipeline(audio_path)
        print(f"✓ Speaker diarization complete!", file=sys.stderr)
    except Exception as e:
        print(f"⚠ Speaker diarization failed: {str(e)[:100]}", file=sys.stderr)
        print("⚠ Continuing without speaker labels...", file=sys.stderr)
        diarization = None

# Step 3: Align transcription with diarization
def get_speaker_at_time(diarization, time_seconds):
    """Get speaker label at a specific time"""
    if diarization is None:
        return "A"

    for turn, _, speaker in diarization.itertracks(yield_label=True):
        if turn.start <= time_seconds <= turn.end:
            return speaker
    return "A"  # Default if no speaker found

output_data = {
    "language": result.get("language", "unknown"),
    "segments": []
}

for segment in result["segments"]:
    # Get speaker at the start of this segment
    speaker = get_speaker_at_time(diarization, segment["start"])

    output_data["segments"].append({
        "start": segment["start"],
        "end": segment["end"],
        "text": segment["text"].strip(),
        "speaker": speaker
    })

# Write output
output_path = sys.argv[3]
with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(output_data, f, ensure_ascii=False, indent=2)

print(f"\\nProcessed {len(output_data['segments'])} segments", file=sys.stderr)
` : `
import sys
import json
import whisper
import torch
import os
from pyannote.audio import Pipeline

# OpenAI Whisper for non-Apple Silicon systems
audio_path = sys.argv[1]
language = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] != "undefined" else None
hf_token = os.environ.get("HF_TOKEN")

def try_transcribe(device, use_fp16):
    """Try transcription with given device"""
    print(f"Loading Whisper model on {device}...", file=sys.stderr)
    model = whisper.load_model("large", device=device)

    print(f"Transcribing audio on {device}...", file=sys.stderr)
    result = model.transcribe(
        audio_path,
        language=language,
        fp16=use_fp16,
        verbose=True
    )
    return result

# Determine device
print("=" * 60, file=sys.stderr)
if torch.cuda.is_available():
    print(f"✓ USING NVIDIA CUDA GPU", file=sys.stderr)
    print(f"  Performance: ~10x faster than real-time", file=sys.stderr)
    device = "cuda"
    use_fp16 = True
else:
    print(f"✓ USING CPU (no GPU detected)", file=sys.stderr)
    print(f"  Performance: ~1.5-2x faster than real-time", file=sys.stderr)
    device = "cpu"
    use_fp16 = False
print("=" * 60, file=sys.stderr)

# Try transcription
try:
    result = try_transcribe(device, use_fp16)
except Exception as e:
    if device == "cuda":
        print(f"\\n⚠ GPU transcription failed: {str(e)[:100]}", file=sys.stderr)
        print(f"⚠ Falling back to CPU...\\n", file=sys.stderr)
        device = "cpu"
        use_fp16 = False
        result = try_transcribe(device, use_fp16)
    else:
        raise

print("\\nTranscription complete! Starting speaker diarization...", file=sys.stderr)

# Step 2: Speaker diarization with pyannote
if not hf_token:
    print("⚠ Warning: HF_TOKEN not found. Skipping speaker diarization.", file=sys.stderr)
    print("⚠ All segments will be labeled as 'Speaker A'.", file=sys.stderr)
    print("⚠ Get a token at https://huggingface.co/settings/tokens", file=sys.stderr)
    diarization = None
else:
    try:
        pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1",
            use_auth_token=hf_token
        )
        diarization = pipeline(audio_path)
        print(f"✓ Speaker diarization complete!", file=sys.stderr)
    except Exception as e:
        print(f"⚠ Speaker diarization failed: {str(e)[:100]}", file=sys.stderr)
        print("⚠ Continuing without speaker labels...", file=sys.stderr)
        diarization = None

# Step 3: Align transcription with diarization
def get_speaker_at_time(diarization, time_seconds):
    """Get speaker label at a specific time"""
    if diarization is None:
        return "A"

    for turn, _, speaker in diarization.itertracks(yield_label=True):
        if turn.start <= time_seconds <= turn.end:
            return speaker
    return "A"  # Default if no speaker found

output_data = {
    "language": result.get("language", "unknown"),
    "segments": []
}

for segment in result["segments"]:
    # Get speaker at the start of this segment
    speaker = get_speaker_at_time(diarization, segment["start"])

    output_data["segments"].append({
        "start": segment["start"],
        "end": segment["end"],
        "text": segment["text"].strip(),
        "speaker": speaker
    })

# Write output
output_path = sys.argv[3]
with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(output_data, f, ensure_ascii=False, indent=2)

print(f"\\nProcessed {len(output_data['segments'])} segments", file=sys.stderr)
`;

  writeFileSync(scriptPath, pythonScript, 'utf-8');

  // Run Python script using venv Python
  await new Promise<void>((resolve, reject) => {
    const args = [scriptPath, audioPath, language || 'undefined', outputPath];
    const python = spawn(getVenvPython(), args);

    let stderrOutput = '';

    python.stderr.on('data', (data) => {
      const output = data.toString();
      stderrOutput += output;
      // Show all progress output from Whisper
      process.stderr.write(output);
    });

    python.stdout.on('data', (data) => {
      process.stdout.write(data.toString());
    });

    python.on('close', (code) => {
      // Clean up script
      unlinkSync(scriptPath);

      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(`Whisper transcription failed with code ${code}: ${stderrOutput}`)
        );
      }
    });

    python.on('error', (err) => {
      reject(new Error(`Failed to run Python: ${err.message}`));
    });
  });

  // Read and parse output
  const outputJson = readFileSync(outputPath, 'utf-8');
  const result = JSON.parse(outputJson);

  // Clean up output file
  unlinkSync(outputPath);

  // Convert to our format
  // Speaker labels come from pyannote.audio diarization
  const segments: TranscriptSegment[] = result.segments.map((seg: any) => ({
    speaker: seg.speaker || 'A', // Speaker from pyannote, default to 'A'
    text: seg.text,
    start: Math.round(seg.start * 1000), // Convert to milliseconds
    end: Math.round(seg.end * 1000),
  }));

  const text = segments.map((s) => s.text).join(' ');

  return {
    segments,
    text,
  };
}
