import { createReadStream } from 'fs';
import OpenAI from 'openai';
import type { TranscriptionResult, TranscriptSegment } from '../types.js';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

/**
 * Transcribe audio file with speaker diarization using OpenAI gpt-4o-transcribe-diarize
 */
export async function transcribeAudioOpenAI(
  audioPath: string,
  language?: string
): Promise<TranscriptionResult> {
  const transcription = await client.audio.transcriptions.create({
    file: createReadStream(audioPath),
    model: 'gpt-4o-transcribe-diarize',
    response_format: 'diarized_json',
    chunking_strategy: 'auto',
    language: language as any,
  }) as any; // Type assertion needed for diarized_json format

  const segments: TranscriptSegment[] = [];

  // OpenAI diarized_json format returns segments array
  if (transcription.segments && Array.isArray(transcription.segments)) {
    for (const segment of transcription.segments) {
      segments.push({
        speaker: segment.speaker || 'Unknown',
        text: segment.text,
        start: Math.round(segment.start * 1000), // Convert seconds to milliseconds
        end: Math.round(segment.end * 1000), // Convert seconds to milliseconds
      });
    }
  }

  return {
    segments,
    text: transcription.text || '',
  };
}
