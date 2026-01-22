import { readFileSync } from 'fs';
import type { TranscriptionResult, TranscriptSegment } from '../types.js';
import { compressAudioForOpenAI } from './youtube.js';

/**
 * Transcribe audio file with speaker diarization using OpenAI gpt-4o-transcribe-diarize
 * Uses direct API call instead of SDK for better control
 */
export async function transcribeAudioOpenAI(
  audioPath: string,
  language?: string
): Promise<TranscriptionResult> {
  try {
    // Compress audio if needed to fit OpenAI's 25MB limit
    const compressedPath = await compressAudioForOpenAI(audioPath);

    console.log(`Using audio file: ${compressedPath}`);

    // Read the file as a buffer
    const audioBuffer = readFileSync(compressedPath);
    const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' });

    // Create FormData for multipart/form-data request
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.mp3');
    formData.append('model', 'gpt-4o-transcribe-diarize');
    formData.append('response_format', 'diarized_json');
    formData.append('chunking_strategy', 'auto');
    if (language) {
      formData.append('language', language);
    }

    // Make direct API call
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      let errorJson;
      try {
        errorJson = JSON.parse(errorBody);
      } catch {
        errorJson = { message: errorBody };
      }

      console.error('\n--- OpenAI API Error Details ---');
      console.error('Status:', response.status);
      console.error('Status Text:', response.statusText);
      console.error('Error body:', errorJson);
      console.error('--- End Error Details ---\n');

      throw new Error(`OpenAI API returned ${response.status}: ${errorJson.error?.message || errorJson.message || 'Unknown error'}`);
    }

    const transcription = await response.json();

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
    // Enhanced error logging
    console.error('\n--- OpenAI API Error Details ---');
    console.error('Error:', error.message);
    console.error('--- End Error Details ---\n');

    throw new Error(`OpenAI transcription failed: ${error.message || 'Unknown error'}`);
  }
}
