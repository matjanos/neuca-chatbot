import { useState, useMemo } from 'react'

interface ThinkingIndicatorProps {
  reasoning?: string
}

// Fun, distinguished Polish phrases for the thinking indicator
const thinkingPhrases = [
  'Deliberuje...',
  'Roztrząsam kwestię...',
  'Medytuję nad zagadnieniem...',
  'Kontempluję...',
  'Snuję refleksje...',
  'Wnikam w materię...',
  'Zgłębiam temat...',
  'Rozmyślam intensywnie...',
  'Przenikam istotę rzeczy...',
  'Rozważam implikacje...',
]

export function ThinkingIndicator({ reasoning }: ThinkingIndicatorProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  // Pick a random phrase once per component instance
  const thinkingPhrase = useMemo(() => {
    return thinkingPhrases[Math.floor(Math.random() * thinkingPhrases.length)]
  }, [])

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] md:max-w-[70%]">
        <button
          onClick={() => reasoning && setIsExpanded(!isExpanded)}
          className={`
            flex items-center gap-2 px-4 py-2.5
            bg-gray-50 text-gray-500 rounded-2xl rounded-bl-md
            ${reasoning ? 'cursor-pointer hover:bg-gray-100' : 'cursor-default'}
            transition-colors
          `}
        >
          {/* Spinning icon */}
          <svg
            className="w-4 h-4 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>

          <span className="text-sm font-medium">{thinkingPhrase}</span>

          {reasoning && (
            <svg
              className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </button>

        {/* Expandable reasoning content */}
        {isExpanded && reasoning && (
          <div className="mt-2 px-4 py-3 bg-gray-50 rounded-xl border border-gray-100">
            <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">
              {reasoning}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
