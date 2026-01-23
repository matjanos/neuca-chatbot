# NEUCA YouTube Transcription CLI

A command-line tool for transcribing YouTube videos with speaker identification.

## Features

- Download and transcribe YouTube videos
- Speaker diarization (identifies different speakers)
- Multiple transcription providers (AssemblyAI cloud, Whisper local)
- Interactive speaker naming tool
- Audio caching for faster re-runs
- Generate embeddings for RAG retrieval (Qdrant + OpenAI)

## Installation

```bash
# Install dependencies
bun install

# Create .env file with your API keys
cp .env.example .env
```

## Configuration

Add to `.env`:

```bash
# For AssemblyAI (cloud transcription)
ASSEMBLYAI_API_KEY=your_key_here

# For local Whisper with speaker diarization (optional)
HF_TOKEN=your_huggingface_token

# For embedding generation
OPENAI_API_KEY=your_key_here
```

## Usage

```bash
bun run cli
```

The interactive CLI will guide you through:

1. **Choose action**: Transcribe video, identify speakers, or generate embeddings
2. **Select model**: AssemblyAI (cloud) or Whisper (local)
3. **Enter YouTube URL**
4. **Select language**: Polish, English, German, Portuguese, Ukrainian, Chinese, or auto-detect

Output is saved to `output/transcript-{videoId}-{timestamp}.txt`

## Embedding Generation

Generate vector embeddings for semantic search and RAG applications.

### Prerequisites

Start Qdrant vector database:

```bash
docker compose up -d
```

### Usage

Select "Generate embeddings for transcript" from the main menu. The CLI will:

1. Check Qdrant connection
2. Let you select a transcript file
3. Choose embedding model (text-embedding-3-large recommended)
4. Choose chunking strategy (balanced, detailed, or overview)
5. Generate and store embeddings in Qdrant

### Verify

```bash
curl http://localhost:6333/collections/transcripts
```

## Example Output

```
===========================================
NEUCA Panel Transcription
Video: What Awaits Poland in the World of AI?
URL: https://www.youtube.com/watch?v=example
Date: 2026-01-23
Duration: 45:32
===========================================

[Speaker A] (00:00:00 - 00:00:15)
Hello and welcome to today's panel discussion.

[Speaker B] (00:00:16 - 00:00:45)
Thank you for having me...
```

## Development

```bash
# Run tests
bun test

# Type check
bun run --cwd apps/cli tsc --noEmit
```

## License

MIT
