# Whisper Local Transcription Setup

This guide explains how to set up local Whisper transcription with GPU acceleration.

## Prerequisites

- Python 3.8 or higher (with pip included)
- **Hugging Face Token** (free) for speaker diarization - Get one at https://huggingface.co/settings/tokens

## Automatic Installation

The CLI automatically installs the best Whisper implementation for your system:

- **Apple Silicon (M1/M2/M3)**: `mlx-whisper` (optimized for Metal GPU)
- **NVIDIA GPU**: `openai-whisper` (with CUDA support)
- **CPU**: `openai-whisper` (universal)

**First time you run Whisper:**
1. CLI detects Whisper is not installed
2. Creates a Python virtual environment (`.venv-whisper/`)
3. Installs the right packages for your system:
   - Apple Silicon: `mlx-whisper` + `pyannote.audio`
   - NVIDIA/CPU: `openai-whisper` + `pyannote.audio`
4. Shows installation progress
5. Proceeds with transcription + speaker diarization

**No manual installation needed!**

This approach uses a virtual environment to avoid macOS's externally-managed-environment restrictions (PEP 668).

## How It Works

- **Virtual Environment**: Created in project root as `.venv-whisper/`
- **Isolated**: Doesn't interfere with system Python or other packages
- **Automatic**: CLI manages everything
- **Clean**: Can delete `.venv-whisper/` folder to reset

## Speaker Diarization Setup

**What is Speaker Diarization?**
Identifies "who spoke when" - assigns labels like SPEAKER_00, SPEAKER_01 to different speakers in the audio.

**Setup (One-time):**

1. **Get a Hugging Face Token** (free):
   - Go to https://huggingface.co/settings/tokens
   - Click "New token"
   - Give it a name (e.g., "neuca-cli")
   - Copy the token

2. **Accept Model Terms** (required):
   - Visit https://huggingface.co/pyannote/speaker-diarization-3.1
   - Click "Agree and access repository"
   - Visit https://huggingface.co/pyannote/segmentation-3.0
   - Click "Agree and access repository"

3. **Add Token to .env**:
   ```bash
   HF_TOKEN=your_token_here
   ```

4. **Restart the CLI** - speaker diarization will now work automatically!

**Without HF_TOKEN:**
- Transcription still works perfectly
- All segments labeled as "Speaker A" (no diarization)
- Warning message displayed

## Manual Installation (Optional)

If you prefer to manage the environment yourself:

```bash
python3 -m venv .venv-whisper
source .venv-whisper/bin/activate
pip install openai-whisper
```

## GPU Acceleration

### macOS (Apple Silicon)
- Uses **mlx-whisper** with Apple's MLX framework
- Native Metal GPU acceleration (no PyTorch MPS issues!)
- Significantly faster than CPU
- No NaN errors or compatibility issues
- Optimized specifically for M1/M2/M3 chips

### Linux/Windows (NVIDIA)
- Uses **openai-whisper** with CUDA acceleration
- Requires NVIDIA GPU with CUDA support
- Install CUDA toolkit if not already installed
- Auto-fallback to CPU if CUDA fails

### CPU Fallback
- Automatically used on non-GPU systems
- Still faster than real-time for most videos
- 100% reliable

## How It Works

1. **First Run**: Downloads Whisper large-v3 model (~3GB)
   - Models are cached in `~/.cache/huggingface/`
   - Only downloads once

2. **Subsequent Runs**: Uses cached model
   - No download needed
   - Faster startup

3. **GPU Detection**: Automatically uses best available hardware
   - Metal (Mac M1/M2/M3)
   - CUDA (NVIDIA)
   - CPU (fallback)

## Usage

Simply select "Whisper (local)" when running the CLI:

```bash
bun run cli
```

Choose:
- "Whisper (local) - may be slower on first run"

The first run will:
1. Download the model (~3GB, one-time)
2. Transcribe your audio with live progress updates
3. Cache the model for future use

**Progress Display**:
During transcription, you'll see:
- Device being used (CPU/GPU)
- Real-time progress bar
- Timestamp of each segment being processed
- Estimated completion time

## Performance

### Apple Silicon with MLX (M1/M2/M3)
- 45-minute video: ~4-7 minutes (GPU accelerated!)
- Real-time factor: ~0.1-0.15x (7-10x faster than real-time)
- Native Metal acceleration via MLX framework

### NVIDIA GPU (CUDA)
- 45-minute video: ~3-5 minutes
- Real-time factor: ~0.1x (10x faster than real-time)
- Mature CUDA support

### CPU Only (Intel/AMD)
- 45-minute video: ~20-30 minutes
- Real-time factor: ~0.5-0.7x (1.5-2x faster than real-time)

## Troubleshooting

### "faster-whisper not found"
```bash
pip3 install faster-whisper
```

### Python not found
Install Python 3:
- macOS: `brew install python3`
- Linux: `sudo apt install python3 python3-pip`
- Windows: Download from python.org

### Model download fails
- Check internet connection
- Ensure ~3GB free disk space
- Models download to `~/.cache/huggingface/`

## Advantages over Cloud APIs

1. **No API costs**: Run unlimited transcriptions
2. **Privacy**: Audio never leaves your computer
3. **Offline**: Works without internet (after model download)
4. **Speed**: With GPU, often faster than API calls
5. **No rate limits**: Transcribe as many files as you want

## Model Information

- **Model**: Whisper large-v2
- **Size**: ~3GB
- **Languages**: 99+ languages supported
- **Quality**: High-quality transcription
- **Timestamps**: Segment-level timestamps
- **Source**: Official OpenAI implementation

## Notes

- **Speaker diarization is included!** Uses pyannote.audio 3.1
- Requires free Hugging Face token (see setup above)
- Works automatically once HF_TOKEN is set
- Identifies 2-10+ speakers in most audio
- AssemblyAI still available as cloud alternative
