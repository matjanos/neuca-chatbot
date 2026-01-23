# Technical Log - NEUCA YouTube Transcription CLI

This document tracks all technical decisions, challenges, and solutions encountered during the development of the YouTube transcription CLI tool with speaker diarization.

---

## Project Overview

**Goal**: Build a CLI tool that downloads YouTube videos, extracts audio, and generates transcriptions with speaker identification.

**Tech Stack**:
- **Runtime**: Bun (fast JavaScript/TypeScript runtime and package manager)
- **CLI Framework**: Clack (@clack/prompts) for interactive prompts
- **YouTube Download**: ytdlp-nodejs (manages yt-dlp binary automatically)
- **Transcription**: AssemblyAI SDK + Whisper (local via faster-whisper)
- **Testing**: bun:test
- **Monorepo**: Bun workspaces

---

## Architecture Decisions

### 1. Monorepo Structure
**Decision**: Use Bun workspaces with apps/cli, apps/api (future), apps/web (future)

**Rationale**:
- Scalability: Easy to add web frontend and backend API later
- Code sharing: Can create shared packages for common utilities
- Unified dependency management
- Single repository for the entire project ecosystem

### 2. CLI Framework: Clack vs Inquirer vs Commander
**Decision**: Chose Clack (@clack/prompts)

**Rationale**:
- Modern, beautiful UI with spinners and progress indicators
- TypeScript-first with excellent type safety
- Lightweight and fast
- Great UX with cancellation support
- Perfect for Bun runtime

### 3. YouTube Download: ytdlp-nodejs vs yt-dlp-wrap vs direct yt-dlp
**Decision**: Chose ytdlp-nodejs package

**Rationale**:
- Automatic binary management (downloads yt-dlp on first run)
- TypeScript types included
- Promise-based API (async/await support)
- Handles ffmpeg dependency via downloadFFmpeg() method
- Active maintenance and good documentation

### 4. Transcription Provider: AssemblyAI vs Whisper (Local) vs Cloud APIs
**Decision**: Support both AssemblyAI (cloud) and Whisper (local) with user selection

**Rationale**:
- AssemblyAI: Purpose-built for transcription, reliable speaker diarization, API-based
- Whisper (local): No API costs, complete privacy, GPU-accelerated, offline capable
- User choice: Cloud vs local, cost vs convenience trade-offs
- Extensibility: Easy to add more providers in the future

**Evolution**: Initially planned OpenAI API support, but persistent "corrupted audio" errors led to switching to local Whisper using faster-whisper library (Challenge 12)

---

## Technical Challenges & Solutions

### Challenge 1: Package Version Mismatches
**Problem**: Initial plan specified outdated package versions
- `@ai-sdk/assemblyai@^0.1.0` (didn't exist)
- `ytdlp-nodejs@^1.0.0` (old version)

**Solution**:
- Checked npm registry for actual versions
- Updated to `@ai-sdk/assemblyai@^2.0.0` and `ytdlp-nodejs@^3.3.9`

**Learning**: Always verify package versions before using in package.json

---

### Challenge 2: AI SDK TranscriptionModelV3 Incompatibility
**Problem**: TypeScript compilation error with @ai-sdk/assemblyai
```typescript
Type 'TranscriptionModelV3' is not assignable to type 'TranscriptionModelV1'.
Types of property 'specificationVersion' are incompatible.
Type '"v3"' is not assignable to type '"v1"'.
```

**Root Cause**: Vercel AI SDK's `transcribe()` function only supports V1 models, but @ai-sdk/assemblyai provides V3 models with diarization.

**Solution**: Switched from @ai-sdk/assemblyai to direct `assemblyai` SDK
```typescript
// Before (didn't work)
import { transcribe } from 'ai';
import { assemblyai } from '@ai-sdk/assemblyai';

// After (works)
import { AssemblyAI } from 'assemblyai';
const client = new AssemblyAI({ apiKey: process.env.ASSEMBLYAI_API_KEY });
await client.transcripts.transcribe({ audio: audioPath, speaker_labels: true });
```

**Learning**: Always check SDK compatibility when using wrapper libraries. Direct SDKs often have more features.

---

### Challenge 3: yt-dlp Binary Not Found
**Problem**: Error during audio download
```
Error: The argument 'file' cannot be empty. Received ''
```

**Root Cause**: yt-dlp binary wasn't properly set up. Initial code didn't use the helper functions correctly.

**Solution**: Properly use ytdlp-nodejs helpers
```typescript
// Before (wrong)
const ytdlp = new YtDlp();

// After (correct)
let binaryPath = helpers.findYtdlpBinary();
if (!binaryPath) {
  binaryPath = await helpers.downloadYtDlp(BIN_DIR);
}
const ytdlp = new YtDlp({ binaryPath });
```

**Learning**: Read package documentation carefully. Helper functions exist for a reason.

---

### Challenge 4: Environment Variables Not Loading
**Problem**: `ASSEMBLYAI_API_KEY` was in `.env` but not being read by the CLI

**Root Cause**: `bun run --cwd apps/cli start` changes working directory to `apps/cli`, but `.env` is in root

**Solution**: Created symlink from `apps/cli/.env` to `../../.env`
```bash
cd apps/cli
ln -s ../../.env .env
```

**Alternative Approaches Considered**:
- ❌ Use `--env-file` flag (not supported by Bun)
- ❌ Hardcode path to root .env (not portable)
- ✅ Symlink (works across all environments)

**Learning**: Be aware of working directory changes in monorepos. Symlinks are a clean solution.

---

### Challenge 5: ASCII Art Background Color
**Problem**: User wanted custom background color (#282C34 - VS Code Dark+ theme color)

**Technical Challenge**:
- HTML file uses hex colors for each character
- Terminal needs ANSI 256-color codes
- Need to map 16.7M hex colors to 256 ANSI colors

**Solution**: Implemented hex to ANSI 256 color converter
```typescript
function hexToAnsi256(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  // Convert RGB to closest ANSI 256 color
  if (r === g && g === b) {
    // Grayscale
    if (r < 8) return 16;
    if (r > 248) return 231;
    return Math.round(((r - 8) / 247) * 24) + 232;
  }

  // Color cube
  const r6 = Math.round(r / 255 * 5);
  const g6 = Math.round(g / 255 * 5);
  const b6 = Math.round(b / 255 * 5);
  return 16 + (36 * r6) + (6 * g6) + b6;
}
```

**Learning**: Terminal colors are limited but can be approximated well with proper mapping.

---

### Challenge 6: Language Selection for Transcription
**Problem**: Auto-detect wasn't always accurate, especially for Polish content

**Solution**: Added explicit language selection with 6 languages + auto-detect
- Polish (pl), English (en), German (de), Portuguese (pt), Ukrainian (uk), Chinese (zh)
- Default: Auto-detect

**Implementation Detail**: Both AssemblyAI and OpenAI support language codes, but with different parameter names:
- AssemblyAI: `language_code`
- OpenAI: `language`

**Learning**: User control over AI parameters improves output quality for known use cases.

---

### Challenge 7: OpenAI Audio Format Compatibility
**Problem**: OpenAI API returned 400 errors with various messages:
- "Audio file might be corrupted or unsupported"
- "something went wrong reading your request"

**Debugging Steps**:
1. First tried WAV format (didn't work)
2. Added detailed error logging to see full error response
3. Displayed audio file path for manual verification
4. Switched to MP3 format

**Current Solution**: Use MP3 format with highest quality
```typescript
await ytdlp.downloadAsync(url, {
  output: outputPath,
  extractAudio: true,
  audioFormat: 'mp3',
  audioQuality: '0', // Best quality
});
```

**Error Logging Enhancement**:
```typescript
catch (error: any) {
  console.error('\n--- OpenAI API Error Details ---');
  console.error('Status:', error.status);
  console.error('Type:', error.type);
  console.error('Code:', error.code);
  console.error('Message:', error.message);
  console.error('Response status:', error.response?.status);
  console.error('Response headers:', JSON.stringify(error.response?.headers, null, 2));
  console.error('Full error object:', JSON.stringify(error, null, 2));
  console.error('--- End Error Details ---\n');
}
```

**Learning**:
- Different AI providers have different audio format preferences
- Comprehensive error logging is crucial for debugging API issues
- MP3 is more universally supported than WAV for speech APIs

---

### Challenge 8: Video Caching Implementation
**Problem**: Re-downloading videos wastes time and bandwidth

**Solution**: Check if audio file exists before downloading
```typescript
export async function downloadAudio(
  url: string,
  outputPath: string
): Promise<{ audioPath: string; wasCached: boolean }> {
  const mp3Path = `${outputPath}.mp3`;

  // Check cache first
  if (existsSync(mp3Path)) {
    return { audioPath: mp3Path, wasCached: true };
  }

  // Download if not cached
  await ytdlp.downloadAsync(url, { /* ... */ });
  return { audioPath: mp3Path, wasCached: false };
}
```

**Cache Location**: `temp/` directory with video ID as filename
- Ignored in .gitignore
- Easy to clear manually
- Persists across CLI runs

**Learning**: Simple file-based caching is effective for audio files. No need for complex cache systems.

---

### Challenge 9: Git Workflow in Monorepo
**Problem**: When creating PR, branch had no common history with main (empty main)

**Solution**:
1. Created `.gitignore` on main branch first
2. Rebased feature branch onto main
3. Manually merged conflicting .gitignore entries

**Merged .gitignore Strategy**:
- Kept standard Node.js ignores
- Added CLI-specific ignores: `temp/`, `output/`, `yt-dlp`, `ffmpeg`
- Kept both IDE sections (.idea and .vscode)

**Learning**: Initialize main branch with basic files before creating feature branches in new repos.

---

### Challenge 10: TypeScript Types for OpenAI Diarized JSON
**Problem**: OpenAI's `diarized_json` response format isn't in official TypeScript types
```typescript
Type '{}' must have a '[Symbol.iterator]()' method that returns an iterator.
```

**Solution**: Type assertion with proper safety checks
```typescript
const transcription = await client.audio.transcriptions.create({
  file: createReadStream(audioPath),
  model: 'gpt-4o-transcribe-diarize',
  response_format: 'diarized_json',
  chunking_strategy: 'auto',
  language: language as any,
}) as any; // Type assertion needed for diarized_json format

// Safe access with runtime checks
if (transcription.segments && Array.isArray(transcription.segments)) {
  for (const segment of transcription.segments) {
    segments.push({
      speaker: segment.speaker || 'Unknown',
      text: segment.text,
      start: Math.round(segment.start * 1000),
      end: Math.round(segment.end * 1000),
    });
  }
}
```

**Learning**: Bleeding-edge API features may not have types yet. Runtime checks are essential when using `any`.

---

### Challenge 11: OpenAI 25MB File Size Limit
**Problem**: OpenAI API has a 25MB limit for audio files, but our high-quality MP3 files were exceeding 90MB for longer videos.

**Error**: 400 Bad Request - "something went wrong reading your request"

**Root Cause**:
- High-quality audio (320kbps, stereo, 44.1kHz) creates large files
- A 45-minute video at high quality = ~90MB
- OpenAI silently rejects files > 25MB with generic error

**Solution**: Implement smart compression with dynamic bitrate calculation
```typescript
export async function compressAudioForOpenAI(inputPath: string): Promise<string> {
  const fileSizeMB = statSync(inputPath).size / (1024 * 1024);

  // Only compress if needed
  if (fileSizeMB < 25) return inputPath;

  // Get audio duration using ffprobe
  const duration = await getAudioDuration(inputPath);

  // Calculate bitrate to ensure file stays under 25MB
  // Target 24MB for safety margin (25MB * 0.96)
  // Formula: Bitrate (kbps) = (target size MB * 8192) / duration seconds
  const targetSizeMB = 24;
  const targetBitrate = Math.floor((targetSizeMB * 8192) / duration);

  // Clamp between 24kbps (minimum acceptable) and 64kbps
  const bitrate = Math.max(24, Math.min(64, targetBitrate));

  // Compress with speech-optimized settings
  await spawn('ffmpeg', [
    '-i', inputPath,
    '-ac', '1',              // Mono
    '-ar', '16000',          // 16kHz sample rate
    '-b:a', `${bitrate}k`,   // Calculated bitrate
    '-y',
    compressedPath
  ]);

  // Validate result is under 25MB
  const compressedSizeMB = statSync(compressedPath).size / (1024 * 1024);
  if (compressedSizeMB >= 25) {
    throw new Error(`Compressed file still exceeds 25MB limit`);
  }

  return compressedPath;
}
```

**Key Improvements**:
- Dynamic bitrate calculation based on audio duration
- Targets 24MB (safety margin below 25MB limit)
- Validation ensures compressed file actually meets limit
- Cached compressed files verified before reuse

**Results**:
- 90MB (45min) → ~22MB with 43kbps bitrate (75% reduction)
- Speech quality remains excellent for transcription
- Bitrate adapts: longer videos get lower bitrate, shorter get higher
- Compression cached (reused on subsequent runs)
- Compression time: ~5-15 seconds depending on video length

**Design Decision**: Compress only for OpenAI, keep high quality for AssemblyAI
- AssemblyAI has no file size limit
- Different providers may benefit from different quality levels
- User can listen to both versions to verify quality

**Learning**:
- Always check provider API limits before processing
- Speech recognition doesn't need music-quality audio
- Mono 16kHz 64kbps is industry standard for speech APIs
- Generic API errors often hide specific constraint violations

---

### Challenge 12: OpenAI API Persistent Audio File Errors
**Problem**: Even after implementing compression and switching to direct API calls, OpenAI continued rejecting audio files with "Audio file might be corrupted or unsupported" error.

**Attempts Made**:
1. ✗ Changed from WAV to MP3 format
2. ✗ Implemented dynamic compression with bitrate calculation
3. ✗ Switched from OpenAI SDK to direct fetch() API calls
4. ✗ Used FormData with Blob for proper multipart encoding
5. ✗ Tried both gpt-4o-transcribe and gpt-4o-transcribe-diarize models

**Root Cause**: Unknown - OpenAI API repeatedly rejected files despite correct format and size

**Final Solution**: Use platform-specific Whisper implementations

**Why different implementations**:
- **faster-whisper**: Requires pkg-config and native dependencies (av/PyAV) - rejected
- **openai-whisper**: Official implementation but MPS (Metal) has NaN bugs
- **mlx-whisper**: Optimized for Apple Silicon with native Metal support - perfect for Mac!

**Implementation Strategy**:
1. **Apple Silicon (M1/M2/M3)**: Use mlx-whisper with MLX framework
   - Native Metal GPU acceleration
   - No PyTorch MPS NaN issues
   - 7-10x faster than real-time

2. **NVIDIA GPUs**: Use openai-whisper with CUDA
   - Mature CUDA support
   - 10x faster than real-time

3. **CPU**: Use openai-whisper
   - Universal fallback
   - Still 1.5-2x faster than real-time

**Code**:
```python
# Apple Silicon (mlx-whisper)
import mlx_whisper
result = mlx_whisper.transcribe(
    audio_path,
    path_or_hf_repo="mlx-community/whisper-large-v3-mlx",
    language=language
)

# NVIDIA/CPU (openai-whisper)
import whisper
model = whisper.load_model("large", device="cuda" if available else "cpu")
result = model.transcribe(audio_path, language=language, fp16=use_cuda)
```

**Key Features**:
- GPU acceleration (Metal on Mac, CUDA on NVIDIA)
- Real-time progress updates during transcription
- No API costs or rate limits
- Privacy: audio never leaves local machine
- Offline operation (after model download)
- One-time model download (~3GB for large-v2)
- Models cached in `~/.cache/torch/hub/`

**Performance**:
- With GPU: 45-min video → 3-5 min (0.1x real-time)
- CPU only: 45-min video → 15-30 min (0.5x real-time)

**Trade-offs**:
- ✅ No API costs
- ✅ Unlimited transcriptions
- ✅ Complete privacy
- ✅ Often faster with GPU
- ✅ Auto-installs faster-whisper on first run (no manual setup)
- ✅ Uses isolated virtual environment (no system package conflicts)
- ✓ Requires Python 3.8+ (for venv creation)
- ✓ First run downloads 3GB model
- ✓ No speaker diarization in base implementation (would need pyannote)

**Setup**:
Automatic! CLI creates virtual environment and installs openai-whisper:
```bash
python3 -m venv .venv-whisper
.venv-whisper/bin/pip install openai-whisper
```
This approach solves macOS externally-managed-environment (PEP 668) restrictions by using an isolated environment. Switched from faster-whisper to openai-whisper to avoid pkg-config dependency issues.

**Known Issue - MPS NaN Values (Solved!)**:
PyTorch's MPS (Metal Performance Shaders) backend has compatibility issues with Whisper that cause NaN values:
```
ValueError: Expected parameter logits (Tensor of shape (1, 51866))
to satisfy the constraint IndependentConstraint(Real(), 1),
but found invalid values: tensor([[nan, nan, nan, ...]], device='mps:0')
```

**Solution**: Use mlx-whisper for Apple Silicon instead of PyTorch
1. **Apple Silicon**: Install `mlx-whisper` (Apple's MLX framework)
   - Native Metal acceleration without PyTorch MPS bugs
   - Specifically optimized for M1/M2/M3 chips
   - ~7-10x faster than real-time
2. **NVIDIA**: Install `openai-whisper` with CUDA
   - Mature CUDA support, very fast
3. **CPU**: Install `openai-whisper` for universal compatibility

Auto-detection based on system architecture (os.arch() === 'arm64' for M-series Macs).

**Learning**:
- When external APIs are unreliable, local solutions can be better
- Local GPU inference is now practical for many AI tasks
- PyTorch MPS still has rough edges with some models (like Whisper)
- Automatic fallback mechanisms provide robustness
- CUDA (NVIDIA) is more mature than MPS for ML workloads
- One-time setup cost (model download) pays off quickly
- Privacy and cost savings are major benefits of local inference

---

### Challenge 13: Adding Speaker Diarization to Local Whisper
**Problem**: Base Whisper transcribes audio but doesn't identify different speakers. Users wanted proper speaker labels like "Speaker A", "Speaker B", etc.

**Initial State**: All segments were labeled as "Speaker A" because Whisper doesn't do speaker diarization.

**Solution**: Integrated pyannote.audio for speaker diarization

**Implementation**:
```python
# Step 1: Transcribe with Whisper (get text + timestamps)
result = mlx_whisper.transcribe(audio_path, ...)

# Step 2: Run speaker diarization with pyannote
pipeline = Pipeline.from_pretrained(
    "pyannote/speaker-diarization-3.1",
    use_auth_token=hf_token
)
diarization = pipeline(audio_path)

# Step 3: Align - match speakers to transcription segments
def get_speaker_at_time(diarization, time_seconds):
    for turn, _, speaker in diarization.itertracks(yield_label=True):
        if turn.start <= time_seconds <= turn.end:
            return speaker
    return "A"

for segment in result["segments"]:
    speaker = get_speaker_at_time(diarization, segment["start"])
    # Assign speaker to this segment
```

**Requirements**:
- Hugging Face token (free) - HF_TOKEN in .env
- Accept license for pyannote models (one-time)
- ~300MB model download on first run

**Results**:
- Accurate speaker identification (SPEAKER_00, SPEAKER_01, etc.)
- Works with 2-10+ speakers
- Adds ~30-60 seconds to transcription time
- All processing still local (privacy maintained)

**Trade-offs**:
- ✅ Real speaker diarization (not fake labels)
- ✅ Works with local Whisper (no cloud API needed)
- ✅ Free (just needs HF token)
- ✓ Requires HF account and model license acceptance
- ✓ Slightly slower than transcription alone
- ✓ First run downloads ~300MB models

**Graceful Degradation**:
- If HF_TOKEN missing: Shows warning, continues with "Speaker A" for all
- If diarization fails: Catches exception, continues with "Speaker A"
- User can still get transcripts even if diarization doesn't work

**Learning**:
- pyannote.audio is production-ready for speaker diarization
- Combining specialized models (Whisper + pyannote) works better than monolithic solutions
- Requiring user tokens for model access is acceptable if well-documented
- Graceful degradation is important for optional features
- Speaker diarization is computationally separate from transcription

---

### Challenge 14: Speaker Identification Tool
**Problem**: After transcription, speakers are labeled generically as "Speaker A", "Speaker B", etc. Users need a way to identify and name speakers by listening to audio samples.

**Requirements**:
- Parse existing transcript files to extract speaker information
- Play audio samples for each speaker using the cached audio file
- Allow users to assign names to speakers
- Save updated transcript with `-identified.txt` suffix

**Solution**: Implemented an interactive CLI tool with the following components:

1. **Speaker Analyzer** (`speaker-analyzer.ts`):
   - Analyzes transcript segments to identify unique speakers
   - Calculates speaking time and segment count per speaker
   - Selects representative audio samples (5-15 seconds, from different parts of recording)

2. **Audio Playback** (`audio-playback.ts`):
   - Extracts audio segments using ffmpeg
   - Plays segments using afplay (macOS native)
   - Manages temp files and cleanup

3. **Transcript I/O** (`transcript-io.ts`):
   - Parses transcript files to extract video info and segments
   - Replaces speaker names based on user mappings
   - Writes updated transcript files

4. **Identify Speakers Command** (`identify-speakers.ts`):
   - Interactive Clack-based CLI flow
   - Shows speaker statistics before identification
   - For each speaker: play samples, replay, navigate, enter name, skip
   - Confirms and saves changes

**User Flow**:
```
1. Select "Identify speakers" from main menu (or prompted after transcription)
2. Choose transcript file from list
3. For each speaker:
   - View segment count and total speaking time
   - Listen to 1-3 audio samples
   - Enter name, skip, or navigate samples
4. Confirm and save to transcript-{id}-{timestamp}-identified.txt
```

**Key Implementation Details**:
```typescript
// Sample selection algorithm
const samples = segments
  .filter(s => s.duration >= 5000)  // At least 5 seconds
  .sort((a, b) => {
    // Prefer 5-15 second segments
    const aInRange = a.duration >= 5000 && a.duration <= 15000;
    const bInRange = b.duration >= 5000 && b.duration <= 15000;
    if (aInRange && !bInRange) return -1;
    if (!aInRange && bInRange) return 1;
    return a.duration - b.duration;
  });

// Select from beginning, middle, end of timeline
indices.push(0, Math.floor(totalSegments / 2), totalSegments - 1);
```

**Audio Extraction**:
```bash
ffmpeg -y -i input.mp3 -ss 00:01:30.000 -to 00:01:45.000 -c copy segment.mp3
afplay segment.mp3
```

**File Locations**:
- Transcripts: `output/transcript-{videoId}-{timestamp}.txt`
- Identified: `output/transcript-{videoId}-{timestamp}-identified.txt`
- Audio cache: `temp/{videoId}.mp3`
- Temp segments: `temp/segments/` (cleaned up after use)

**Trade-offs**:
- macOS only (uses afplay for playback)
- Requires ffmpeg installed
- Audio must be cached locally (not re-downloaded)

**Learning**:
- Clack prompts work well for multi-step interactive flows
- ffmpeg `-c copy` is fast for extracting segments (no re-encoding)
- Temp file cleanup is important for long-running sessions
- Sample selection from different parts of recording helps identify speakers who may sound different at start vs end

---

## Performance Optimizations

### 1. Timing Counters
**Implementation**: Track and display elapsed time for each operation
```typescript
function formatElapsedTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

// Usage
startTime = Date.now();
await someOperation();
s.stop(`Operation complete (${formatElapsedTime(Date.now() - startTime)})`);
```

**Typical Timings**:
- yt-dlp setup: ~1-2s (cached: <1s)
- Video info fetch: ~1-2s
- Audio download: ~5-30s (depends on video length and network)
- Transcription: ~20-180s (depends on audio length and provider)

### 2. File Caching
**Impact**:
- First run: Downloads audio (10-30s)
- Subsequent runs: Uses cache (~0s)
- Saves bandwidth and time for experimentation

---

## Testing Strategy

### Unit Tests
**Framework**: bun:test (built into Bun)

**Test Coverage**:
- `tests/format.test.ts` (18 tests): Timestamp formatting, speaker labels, video ID extraction
- `tests/youtube.test.ts` (18 tests): URL validation, various YouTube URL formats

**Test Results**: 36 tests, 57 assertions, all passing

**Example Test**:
```typescript
import { describe, test, expect } from 'bun:test';
import { formatTimestamp } from '../src/utils/format';

describe('formatTimestamp', () => {
  test('formats milliseconds to HH:MM:SS', () => {
    expect(formatTimestamp(0)).toBe('00:00:00');
    expect(formatTimestamp(5000)).toBe('00:00:05');
    expect(formatTimestamp(65000)).toBe('00:01:05');
    expect(formatTimestamp(3665000)).toBe('01:01:05');
  });
});
```

### Integration Testing
**Manual Testing Workflow**:
1. Run CLI with short video (~2-3 min)
2. Test both AssemblyAI and OpenAI models
3. Verify speaker diarization accuracy
4. Check output file format
5. Test cache (run same video twice)
6. Test error handling (invalid URL, missing API key)

---

## CI/CD Pipeline

### GitHub Actions Workflow
**File**: `.github/workflows/ci.yml`

**Runs on**:
- Pull requests to main
- Pushes to main

**Steps**:
1. Checkout code
2. Setup Bun
3. Install dependencies (`bun install`)
4. Type check (`bun run --cwd apps/cli tsc --noEmit`)
5. Run tests (`bun test`)

**Why These Checks**:
- Type checking catches TypeScript errors
- Tests ensure functionality isn't broken
- Fast feedback loop (<1 minute)

---

## Output Format

### Transcript File Structure
```
===========================================
NEUCA Panel Transcription
Video: What Awaits Poland in the World of AI?
URL: https://www.youtube.com/watch?v=Ya5Cg9qRspg
Date: 2026-01-22
Duration: 45:32
===========================================

[Speaker A] (00:00:00 - 00:00:15)
Hello and welcome to today's panel discussion about
what awaits Poland in the world of AI.

[Speaker B] (00:00:16 - 00:00:45)
Thank you for having me. I think Poland has a unique
opportunity in the AI space...
```

**Design Decisions**:
- Clear metadata header with video info
- Speaker labels (A, B, C, etc.)
- Timestamps in HH:MM:SS format (human-readable)
- Paragraph breaks between speakers
- Saved to `output/` directory with timestamp

---

## Security & Best Practices

### 1. API Key Management
- Stored in `.env` file (not committed to git)
- `.env.example` provided for setup guidance
- Runtime validation (error if key missing)

### 2. File System Safety
- Temp files in dedicated `temp/` directory
- Output files in dedicated `output/` directory
- Both directories in .gitignore
- Recursive directory creation with error handling

### 3. Error Handling
- Try-catch blocks for all async operations
- Informative error messages
- Graceful degradation (e.g., "Unknown Speaker" if diarization fails)
- Detailed error logging for debugging

---

## Future Improvements

### Planned Features
1. **Web Interface** (apps/web)
   - Upload audio files directly
   - Real-time transcription progress
   - Download transcripts as TXT, SRT, VTT

2. **Backend API** (apps/api)
   - REST API for transcription
   - Job queue for long videos
   - Database for transcript storage

3. **Additional Providers**
   - Deepgram (fast real-time transcription)
   - Google Speech-to-Text
   - Azure Speech Services

4. **Output Formats**
   - SRT subtitles
   - VTT web subtitles
   - JSON with metadata

### Technical Debt
- Add retry logic for API failures
- Implement better caching (TTL, size limits)
- Add progress bars for downloads
- Add audio file validation before upload

---

## Key Learnings

1. **Direct SDKs > Wrapper Libraries**: Direct provider SDKs often have more features and better documentation than abstraction layers.

2. **Error Logging is Critical**: Comprehensive error logging saved hours of debugging, especially with external APIs.

3. **User Choice Matters**: Supporting multiple providers (AssemblyAI + OpenAI) gives users flexibility.

4. **Audio Format Compatibility**: Different AI providers prefer different formats. MP3 is most universally supported.

5. **Caching is Simple but Effective**: File-based caching with existence checks is sufficient for audio files.

6. **Monorepo Setup Takes Time**: Initial setup is more complex, but pays off for extensibility.

7. **TypeScript + Bun = Fast Development**: Bun's speed and built-in TypeScript support accelerate development.

8. **Helper Functions Exist for a Reason**: ytdlp-nodejs helpers abstract binary management complexity.

9. **Testing Early Catches Issues**: Unit tests caught edge cases in URL parsing and timestamp formatting.

10. **UX Details Matter**: Timing counters, colored ASCII art, and cache indicators improve user experience.

---

## Project Statistics

- **Total Files Created**: 22 files
- **Lines of Code**: ~1100 (src) + ~300 (tests)
- **Test Coverage**: 36 tests, 100% of utility functions
- **Dependencies**: 8 (runtime) + 2 (dev)
- **Supported Languages**: 6 + auto-detect
- **Supported Providers**: 2 (AssemblyAI, Whisper local)
- **Features**: Transcription, Speaker Identification

---

---

### Challenge 15: Embedding Generation for RAG Retrieval
**Problem**: Enable semantic search over transcripts for RAG applications. Users need to query transcripts and retrieve relevant context.

**Solution**: Implemented a complete embedding pipeline with the following components:

**1. Infrastructure**
- Docker Compose setup for Qdrant vector database
- Single `transcripts` collection with datasetId filtering (enables cross-video search)
- Indexed payload fields: `datasetId`, `speaker`, `chunkIndex`

**2. Chunking Strategy (speaker-aware)**
- Merge consecutive same-speaker segments until token limit
- Split long segments at sentence boundaries
- Apply 20% overlap between chunks for context preservation
- Default: 400 tokens per chunk, 80 token overlap, 100 token minimum

**3. Embedding Service**
- Uses Vercel AI SDK with OpenAI provider
- Model: `text-embedding-3-large` (3072 dimensions) by default
- Batch processing with configurable batch size (default: 100)

**4. Qdrant Service**
- Point ID format: `yt-{videoId}:{chunkIndex:06d}`
- Supports similarity search with optional datasetId/speaker filters
- Context expansion: retrieve chunk neighbors (±1) for better coherence

**Key Dependencies Added**:
```bash
bun add ai @ai-sdk/openai @qdrant/js-client-rest gpt-tokenizer
```

**Chunking Presets**:
| Preset | Chunk Size | Overlap | Use Case |
|--------|-----------|---------|----------|
| Balanced | 400 tokens | 80 | General transcripts (default) |
| Detailed | 200 tokens | 50 | Short-form Q&A |
| Overview | 800 tokens | 100 | Summarization |

**Cost Estimation** (text-embedding-3-large):
- ~$0.13 per 1M tokens
- Typical 1-hour transcript (~15K tokens): ~$0.002

**CLI Flow**:
```
Main Menu → "Generate embeddings" → Select transcript → Choose model →
Choose chunking preset → Preview cost → Confirm → Generate → Store in Qdrant
```

**Files Created**:
- `docker-compose.yml` - Qdrant container configuration
- `apps/cli/src/services/chunking.ts` - Speaker-aware text chunking
- `apps/cli/src/services/embedding.ts` - AI SDK wrapper for OpenAI embeddings
- `apps/cli/src/services/qdrant.ts` - Qdrant client operations
- `apps/cli/src/commands/generate-embeddings.ts` - CLI command

**Learning**:
- Token counting with `gpt-tokenizer` is fast and synchronous (pure JS)
- Speaker-aware chunking preserves conversational context better than naive splitting
- Overlap tokens help maintain context across chunk boundaries
- Qdrant payload indexes dramatically speed up filtered searches
- The AI SDK abstracts away OpenAI batch handling complexity

---

## Project Statistics

- **Total Files Created**: 27 files
- **Lines of Code**: ~1500 (src) + ~300 (tests)
- **Test Coverage**: 36 tests, 100% of utility functions
- **Dependencies**: 12 (runtime) + 2 (dev)
- **Supported Languages**: 6 + auto-detect
- **Supported Providers**: 2 (AssemblyAI, Whisper local)
- **Features**: Transcription, Speaker Identification, Embedding Generation

---

*Last Updated: 2026-01-23*
