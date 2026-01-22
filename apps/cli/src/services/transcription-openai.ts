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
  try {
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
  } catch (error: any) {
    // Enhanced error logging for OpenAI API errors
    console.error('\n--- OpenAI API Error Details ---');
    console.error('Status:', error.status);
    console.error('Type:', error.type);
    console.error('Code:', error.code);
    console.error('Message:', error.message);

    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response headers:', JSON.stringify(error.response.headers, null, 2));
    }

    if (error.error) {
      console.error('Error details:', JSON.stringify(error.error, null, 2));
    }

    console.error('Full error object:', JSON.stringify(error, null, 2));
    console.error('--- End Error Details ---\n');

    throw new Error(`OpenAI transcription failed: ${error.message || 'Unknown error'}`);
  }
}
