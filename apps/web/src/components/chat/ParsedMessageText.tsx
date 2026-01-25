import { splitTextByTimestamps } from '../../utils/timestamp-parser'
import { TimestampLink } from './TimestampLink'

interface ParsedMessageTextProps {
  text: string
  onTimestampClick?: (startSeconds: number) => void
  videoId?: string | null
}

export function ParsedMessageText({
  text,
  onTimestampClick,
  videoId,
}: ParsedMessageTextProps) {
  // Only parse timestamps if we have a video ID and click handler
  if (!videoId || !onTimestampClick) {
    return <>{text}</>
  }

  const segments = splitTextByTimestamps(text)

  return (
    <>
      {segments.map((segment, index) => {
        if (segment.type === 'timestamp' && segment.timestamp) {
          return (
            <TimestampLink
              key={index}
              timestamp={segment.timestamp}
              onClick={onTimestampClick}
            />
          )
        }
        return <span key={index}>{segment.content}</span>
      })}
    </>
  )
}
