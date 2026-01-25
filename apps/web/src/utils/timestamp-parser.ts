export interface ParsedTimestamp {
  startSeconds: number
  endSeconds?: number
  originalText: string
  startIndex: number
  endIndex: number
}

// Matches: "56:08", "1:23:45", "56:08-57:03", "ok. 56:08", "(ok. 58:30)"
// Avoids matching simple ratios like "1:1" or "2:3" by requiring at least 2 digits in minutes
const TIMESTAMP_REGEX = /(?:ok\.\s*)?(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*[–-]\s*(\d{1,2}):(\d{2})(?::(\d{2}))?)?/gi

/**
 * Convert hours, minutes, seconds to total seconds
 */
export function timeToSeconds(h: number, m: number, s: number): number {
  return h * 3600 + m * 60 + s
}

/**
 * Parse a timestamp match into seconds
 * Handles both MM:SS and HH:MM:SS formats
 */
function parseTimeComponents(
  part1: string,
  part2: string,
  part3?: string
): number {
  if (part3) {
    // HH:MM:SS format
    return timeToSeconds(parseInt(part1), parseInt(part2), parseInt(part3))
  }
  // MM:SS format
  return timeToSeconds(0, parseInt(part1), parseInt(part2))
}

/**
 * Parse all timestamps from a text string
 */
export function parseTimestamps(text: string): ParsedTimestamp[] {
  const timestamps: ParsedTimestamp[] = []
  let match: RegExpExecArray | null

  // Reset regex lastIndex for fresh iteration
  TIMESTAMP_REGEX.lastIndex = 0

  while ((match = TIMESTAMP_REGEX.exec(text)) !== null) {
    const [fullMatch, startP1, startP2, startP3, endP1, endP2, endP3] = match

    const startSeconds = parseTimeComponents(startP1, startP2, startP3)

    let endSeconds: number | undefined
    if (endP1 && endP2) {
      endSeconds = parseTimeComponents(endP1, endP2, endP3)
    }

    timestamps.push({
      startSeconds,
      endSeconds,
      originalText: fullMatch,
      startIndex: match.index,
      endIndex: match.index + fullMatch.length,
    })
  }

  return timestamps
}

/**
 * Format seconds to human-readable timestamp (MM:SS or HH:MM:SS)
 */
export function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}

/**
 * Split text into segments (plain text and timestamps)
 */
export interface TextSegment {
  type: 'text' | 'timestamp'
  content: string
  timestamp?: ParsedTimestamp
}

export function splitTextByTimestamps(text: string): TextSegment[] {
  const timestamps = parseTimestamps(text)

  if (timestamps.length === 0) {
    return [{ type: 'text', content: text }]
  }

  const segments: TextSegment[] = []
  let lastIndex = 0

  for (const ts of timestamps) {
    // Add text before timestamp
    if (ts.startIndex > lastIndex) {
      segments.push({
        type: 'text',
        content: text.slice(lastIndex, ts.startIndex),
      })
    }

    // Add timestamp
    segments.push({
      type: 'timestamp',
      content: ts.originalText,
      timestamp: ts,
    })

    lastIndex = ts.endIndex
  }

  // Add remaining text after last timestamp
  if (lastIndex < text.length) {
    segments.push({
      type: 'text',
      content: text.slice(lastIndex),
    })
  }

  return segments
}
