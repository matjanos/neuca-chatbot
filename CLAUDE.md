# Instructions for Claude

This file contains important context and reminders for Claude Code sessions working on this project.

---

## Technical Documentation

**IMPORTANT**: This project maintains a technical log at `/TECHNICAL_LOG.md` that documents all technical decisions, challenges, and solutions.

### When to Update TECHNICAL_LOG.md

You MUST update the technical log when:

1. **Making architectural decisions**
   - Choosing between technology options (e.g., libraries, frameworks, patterns)
   - Deciding on project structure or file organization
   - Selecting approaches for implementation

2. **Solving technical challenges**
   - Encountering and fixing errors or bugs
   - Debugging API issues or integration problems
   - Working around limitations or incompatibilities

3. **Changing implementation approaches**
   - Switching from one library to another
   - Changing file formats, data structures, or APIs
   - Refactoring significant portions of code

4. **Adding new features**
   - Integrating new services or providers
   - Implementing new CLI commands or options
   - Adding new output formats or capabilities

5. **Performance optimizations**
   - Adding caching mechanisms
   - Improving execution speed
   - Reducing resource usage

### How to Update TECHNICAL_LOG.md

Use this format for new entries:

```markdown
### Challenge X: [Brief Title]
**Problem**: [Description of the issue]

**Root Cause**: [Why it happened]

**Solution**: [How it was solved]
[code example if relevant]

**Learning**: [Key takeaway]

---
```

For architectural decisions:

```markdown
### X. [Decision Topic]
**Decision**: [What was chosen]

**Rationale**:
- [Reason 1]
- [Reason 2]
- [Reason 3]

**Alternatives Considered**:
- ❌ [Option 1]: [Why rejected]
- ❌ [Option 2]: [Why rejected]
- ✅ [Chosen option]: [Why chosen]
```

### Updating Existing Entries

- Add updates to the relevant section (don't create duplicates)
- Add timestamps for significant changes
- Keep the narrative chronological

---

## Project Context

### Tech Stack
- **Runtime**: Bun (JavaScript/TypeScript runtime)
- **CLI Framework**: Clack (@clack/prompts)
- **YouTube Download**: ytdlp-nodejs
- **Transcription**: AssemblyAI SDK + OpenAI API
- **Testing**: bun:test
- **Monorepo**: Bun workspaces

### Project Structure
```
neuca-chatbot/
├── apps/
│   ├── cli/          # Current: YouTube transcription CLI
│   ├── api/          # Future: Backend API
│   └── web/          # Future: Web interface
├── packages/         # Future: Shared packages
├── TECHNICAL_LOG.md  # ⭐ Technical decisions and challenges
└── CLAUDE.md         # This file
```

### Key Files
- `apps/cli/src/index.ts` - CLI entry point with Clack prompts
- `apps/cli/src/commands/transcribe.ts` - Main transcription workflow
- `apps/cli/src/services/youtube.ts` - yt-dlp integration
- `apps/cli/src/services/transcription.ts` - AssemblyAI integration
- `apps/cli/src/services/transcription-openai.ts` - OpenAI integration
- `apps/cli/src/utils/ascii-art.ts` - ASCII art rendering
- `apps/cli/src/utils/format.ts` - Transcript formatting utilities

---

## Common Tasks

### Running the CLI
```bash
bun run cli
```

### Running Tests
```bash
bun test
```

### Type Checking
```bash
bun run --cwd apps/cli tsc --noEmit
```

---

## Known Issues & Considerations

1. **OpenAI Audio Format**: Still investigating 400 errors. Current approach uses MP3 format with detailed error logging.

2. **Environment Variables**: Uses symlink from `apps/cli/.env` to root `.env` because `bun run --cwd` changes working directory.

3. **Cache Location**: Audio files cached in `temp/` directory with video ID as filename. Can grow large - may need cleanup mechanism.

4. **Speaker Labels**: Both AssemblyAI and OpenAI use different formats for speaker identification. Our code normalizes to "Speaker A", "Speaker B", etc.

---

## Coding Conventions

1. **Error Handling**: Always use try-catch blocks for async operations with informative error messages
2. **Types**: Use TypeScript strict mode, define interfaces in `types.ts`
3. **Testing**: Write unit tests for utility functions, especially formatters and parsers
4. **Git Commits**: Use conventional commits format with co-author attribution
5. **Comments**: Add comments for complex logic, API quirks, or non-obvious decisions

---

## Environment Variables Required

```bash
ASSEMBLYAI_API_KEY=your_api_key_here  # For AssemblyAI transcription
OPENAI_API_KEY=your_api_key_here      # For OpenAI transcription
```

---

## Remember

- Update TECHNICAL_LOG.md when making significant technical decisions or solving challenges
- Keep documentation in sync with code changes
- Test thoroughly before committing (type check + unit tests)
- Maintain backwards compatibility when possible
- Prioritize user experience (timing counters, clear error messages, progress indicators)

---

*This file helps maintain context across Claude Code sessions. Update it when project structure or conventions change.*
