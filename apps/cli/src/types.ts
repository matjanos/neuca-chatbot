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

export interface SpeakerInfo {
  label: string;
  normalizedLabel: string;
  segmentCount: number;
  totalDuration: number;
  segments: TranscriptSegment[];
  assignedName?: string;
}

export interface AudioSample {
  segmentIndex: number;
  start: number;  // ms
  end: number;    // ms
  duration: number;
  text: string;
}
