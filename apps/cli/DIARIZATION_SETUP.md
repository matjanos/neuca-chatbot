# Speaker Diarization Setup (3 minutes)

Speaker diarization identifies **who spoke when** in your audio. Without it, all segments are labeled as "Speaker A".

## Quick Setup

### 1. Get Hugging Face Token (30 seconds)
1. Go to https://huggingface.co/settings/tokens
2. Click **"New token"**
3. Name it (e.g., "neuca-cli")
4. Copy the token

### 2. Accept Model License (1 minute)
Visit these two pages and click **"Agree and access repository"**:
- https://huggingface.co/pyannote/speaker-diarization-3.1
- https://huggingface.co/pyannote/segmentation-3.0

### 3. Add to .env (30 seconds)
Open `.env` file in project root and add:
```bash
HF_TOKEN=hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 4. Done!
Run `bun run cli` - speaker diarization now works automatically!

## What You Get

**Before** (without HF_TOKEN):
```
[Speaker A] (00:00:00 - 00:00:10)
Hello, welcome to the panel.

[Speaker A] (00:00:10 - 00:00:15)
Thank you for having me.
```

**After** (with HF_TOKEN):
```
[Speaker SPEAKER_00] (00:00:00 - 00:00:10)
Hello, welcome to the panel.

[Speaker SPEAKER_01] (00:00:10 - 00:00:15)
Thank you for having me.
```

## How It Works

1. **Whisper** transcribes audio → text with timestamps
2. **pyannote.audio** identifies speakers → who speaks when
3. **Alignment** matches transcription segments with speakers
4. **Output** shows speaker labels for each segment

## Troubleshooting

### "Repository not found" error
- Make sure you accepted license for BOTH models (step 2)
- Token must have read access

### "Invalid token" error
- Check token is correct in .env
- Token should start with `hf_`

### Slow first run
- pyannote downloads models (~300MB) on first use
- Cached locally for future runs

### Speaker labels seem wrong
- pyannote uses embeddings to cluster voices
- Works best with 2-10 speakers
- Background noise can create extra "speakers"

## Performance Impact

- **First run**: +2-3 minutes (model download)
- **Subsequent runs**: +30-60 seconds for diarization
- **Worth it**: Much better transcripts!

## Privacy

- Everything runs locally
- HF token only used to download models (once)
- Audio never sent to Hugging Face

## Without HF_TOKEN

No problem! Transcription still works perfectly:
- All segments labeled as "Speaker A"
- Slightly faster (no diarization)
- Use AssemblyAI if you need cloud-based diarization
