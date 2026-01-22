import { AssemblyAI } from 'assemblyai';
import type { TranscriptionResult, TranscriptSegment } from '../types.js';

const client = new AssemblyAI({
  apiKey: process.env.ASSEMBLYAI_API_KEY!,
});

/**
 * Transcribe audio file with speaker diarization using AssemblyAI
 */
export async function transcribeAudio(
  audioPath: string,
  language?: string
): Promise<TranscriptionResult> {
  const transcript = await client.transcripts.transcribe({
    audio: audioPath,
    speaker_labels: true,
    punctuate: true,
    format_text: true,
    language_code: language as any, // AssemblyAI will auto-detect if undefined
  });

  if (transcript.status === 'error') {
    throw new Error(`Transcription failed: ${transcript.error}`);
  }

  const segments: TranscriptSegment[] = [];

  if (transcript.utterances) {
    for (const utterance of transcript.utterances) {
      segments.push({
        speaker: utterance.speaker,
        text: utterance.text,
        start: utterance.start,
        end: utterance.end,
      });
    }
  }

  return {
    segments,
    text: transcript.text || '',
  };
}
