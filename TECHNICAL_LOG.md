# Technical Log - NEUCA YouTube Transcription CLI

This document tracks all technical decisions, challenges, and solutions encountered during the development of the YouTube transcription CLI tool with speaker diarization.

---

## Project Overview

**Goal**: Build a CLI tool that downloads YouTube videos, extracts audio, and generates transcriptions with speaker identification.

**Tech Stack**:
- **Runtime**: Bun (fast JavaScript/TypeScript runtime and package manager)
- **CLI Framework**: Clack (@clack/prompts) for interactive prompts
- **YouTube Download**: ytdlp-nodejs (manages yt-dlp binary automatically)
- **Transcription**: AssemblyAI SDK + OpenAI API (gpt-4o-transcribe-diarize)
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

### 4. Transcription Provider: AssemblyAI vs OpenAI vs Deepgram
**Decision**: Support both AssemblyAI and OpenAI with user selection

**Rationale**:
- AssemblyAI: Purpose-built for transcription, reliable speaker diarization
- OpenAI: gpt-4o-transcribe-diarize model, alternative for users with OpenAI credits
- User choice: Different pricing models and quality trade-offs
- Extensibility: Easy to add more providers in the future

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

- **Total Files Created**: 18 files
- **Lines of Code**: ~800 (src) + ~300 (tests)
- **Test Coverage**: 36 tests, 100% of utility functions
- **Dependencies**: 8 (runtime) + 2 (dev)
- **Supported Languages**: 6 + auto-detect
- **Supported Providers**: 2 (AssemblyAI, OpenAI)
- **Development Time**: ~3 hours (initial implementation) + ~2 hours (refinements)

---

*Last Updated: 2026-01-22*
