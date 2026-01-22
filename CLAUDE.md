# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

```bash
# Run the CLI
bun run cli

# Run all tests
bun test

# Run a single test file
bun test apps/cli/tests/format.test.ts

# Type check
bun run --cwd apps/cli tsc --noEmit
```

## Architecture

This is a **YouTube transcription CLI** built with Bun workspaces monorepo structure.

### Data Flow
```
YouTube URL → yt-dlp (download audio) → Whisper/AssemblyAI (transcribe) → Speaker ID (diarization) → Output file
```

### Key Components

**CLI Entry** (`apps/cli/src/index.ts`)
- Clack-based interactive prompts
- Main menu: Transcribe, Identify Speakers

**Transcription Pipeline** (`apps/cli/src/commands/transcribe.ts`)
- Orchestrates: URL validation → audio download → provider selection → transcription → output

**Transcription Providers** (`apps/cli/src/services/`)
- `transcription.ts` - AssemblyAI (cloud API with built-in diarization)
- `transcription-whisper.ts` - Local Whisper via Python (mlx-whisper on Apple Silicon, openai-whisper elsewhere)
- `transcription-openai.ts` - OpenAI API (currently has issues, see TECHNICAL_LOG.md)

**Speaker Identification** (`apps/cli/src/commands/identify-speakers.ts`)
- Post-transcription tool to name speakers by listening to audio samples
- Uses `speaker-analyzer.ts` for segment analysis and `audio-playback.ts` for ffmpeg/afplay

**YouTube Service** (`apps/cli/src/services/youtube.ts`)
- yt-dlp wrapper with automatic binary management
- Caches audio in `temp/{videoId}.mp3`

### File Locations
- Audio cache: `temp/`
- Transcripts: `output/transcript-{videoId}-{timestamp}.txt`
- Whisper venv: `.venv-whisper/`

## Documentation Requirements

**TECHNICAL_LOG.md** - Update when:
- Making architectural decisions or choosing between libraries
- Solving technical challenges or debugging API issues
- Changing implementation approaches
- Adding new features or providers

Use the entry format documented in TECHNICAL_LOG.md.

**README.md** - Update when:
- Adding new CLI commands or options
- Changing installation steps or dependencies
- Modifying the output format

## Environment Variables

```bash
# Required for cloud transcription
ASSEMBLYAI_API_KEY=...
OPENAI_API_KEY=...

# Required for local Whisper with speaker diarization
HF_TOKEN=...  # Hugging Face token for pyannote models
```

Environment files: Root `.env` symlinked to `apps/cli/.env` (Bun's `--cwd` changes working directory).

## Known Issues

1. **OpenAI Audio API**: Persistent "corrupted audio" errors - use AssemblyAI or local Whisper instead
2. **PyTorch MPS**: NaN values on Apple Silicon - solved by using mlx-whisper instead of openai-whisper
3. **Audio playback**: macOS only (uses `afplay`)

## Conventions

- Interfaces defined in `apps/cli/src/types.ts`
- Conventional commits with co-author: `Co-Authored-By: Claude <noreply@anthropic.com>`
- Tests use `bun:test` framework
