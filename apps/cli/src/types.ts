export interface VideoInfo {
  id: string;
  title: string;
  duration: number;
  url: string;
}

export interface TranscriptSegment {
  speaker: string;
  text: string;
  start: number;
  end: number;
}

export interface TranscriptionResult {
  segments: TranscriptSegment[];
  text: string;
}

export interface ColoredChar {
  char: string;
  color: string;
}

export interface TranscriptOutput {
  videoInfo: VideoInfo;
  segments: TranscriptSegment[];
  timestamp: string;
}
