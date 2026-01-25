import type { ParsedTimestamp } from '../../utils/timestamp-parser'

interface TimestampLinkProps {
  timestamp: ParsedTimestamp
  onClick: (startSeconds: number) => void
}

export function TimestampLink({ timestamp, onClick }: TimestampLinkProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    onClick(timestamp.startSeconds)
  }

  return (
    <button
      onClick={handleClick}
      className="inline text-neuca hover:text-neuca-dark underline underline-offset-2 decoration-neuca/40 hover:decoration-neuca/60 transition-colors cursor-pointer"
      title={`Przejdź do ${timestamp.originalText}`}
    >
      {timestamp.originalText}
    </button>
  )
}
