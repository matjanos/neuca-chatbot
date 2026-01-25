import { FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import { Mascot } from '../mascot/Mascot'
import { SuggestionChip } from './SuggestionChip'

interface WelcomeScreenProps {
  onSuggestionClick: (prompt: string) => void
  input: string
  setInput: (value: string) => void
  onSubmit: (e: FormEvent<HTMLFormElement>) => void
}

const suggestions = [
  {
    text: 'Główne tematy',
    prompt: 'Jakie były główne tematy omawiane na wykładzie?',
  },
  {
    text: 'Kluczowe wnioski',
    prompt: 'Jakie są najważniejsze wnioski z tego wykładu?',
  },
  {
    text: 'Streszczenie',
    prompt: 'Streszczenie najważniejszych punktów z wykładu.',
  },
  {
    text: 'Pytania i odpowiedzi',
    prompt: 'Jakie pytania padły podczas wykładu?',
  },
]

export function WelcomeScreen({ onSuggestionClick }: WelcomeScreenProps) {
  const [localInput, setLocalInput] = useState('')

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && localInput.trim()) {
      e.preventDefault()
      onSuggestionClick(localInput)
    }
  }

  const handleFormSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (localInput.trim()) {
      onSuggestionClick(localInput)
    }
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
      {/* Subtle glow effect behind content */}
      <div className="relative">
        <div className="absolute inset-0 -inset-x-32 -inset-y-20 bg-gradient-radial from-neuca/[0.06] via-neuca/[0.02] to-transparent blur-3xl pointer-events-none" />

        <div className="relative max-w-xl w-full flex flex-col items-center">
          {/* Mascot - smaller size */}
          <Mascot size="md" />

          {/* Simplified heading */}
          <h1 className="mt-6 text-2xl md:text-3xl font-semibold text-text-primary text-center">
            W czym mogę pomóc?
          </h1>

          {/* Input box - centered */}
          <form onSubmit={handleFormSubmit} className="mt-8 w-full max-w-lg">
            <div className="relative">
              {/* Subtle glow on focus */}
              <div className="flex items-center gap-3 bg-white rounded-2xl px-5 py-4 border border-gray-200 shadow-sm hover:shadow-md focus-within:shadow-glow-sm focus-within:border-gray-300 transition-all duration-200">
                {/* Attachment button placeholder */}
                <button
                  type="button"
                  className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  aria-label="Dodaj zalacznik"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="w-5 h-5"
                  >
                    <path
                      fillRule="evenodd"
                      d="M15.621 4.379a3 3 0 00-4.242 0l-7 7a3 3 0 004.241 4.243h.001l.497-.5a.75.75 0 011.064 1.057l-.498.501-.002.002a4.5 4.5 0 01-6.364-6.364l7-7a4.5 4.5 0 016.368 6.36l-3.455 3.553A2.625 2.625 0 119.52 9.52l3.45-3.451a.75.75 0 111.061 1.06l-3.45 3.451a1.125 1.125 0 001.587 1.595l3.454-3.553a3 3 0 000-4.242z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>

                <input
                  type="text"
                  name="message"
                  value={localInput}
                  onChange={(e) => setLocalInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Napisz wiadomosc..."
                  className="flex-1 bg-transparent outline-none text-text-primary placeholder:text-gray-400 text-[15px]"
                />

                {/* Dark send button */}
                <button
                  type="submit"
                  disabled={!localInput.trim()}
                  className="flex-shrink-0 w-9 h-9 flex items-center justify-center bg-gray-800 hover:bg-gray-900 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-xl transition-colors"
                  aria-label="Wyslij wiadomosc"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="w-4 h-4"
                  >
                    <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
                  </svg>
                </button>
              </div>
            </div>
          </form>

          {/* Suggestion chips - horizontal layout */}
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {suggestions.map((suggestion) => (
              <SuggestionChip
                key={suggestion.text}
                text={suggestion.text}
                prompt={suggestion.prompt}
                onClick={onSuggestionClick}
              />
            ))}
          </div>

          {/* Voice assistant link */}
          <Link
            to="/voice"
            className="mt-8 text-2xl hover:scale-110 transition-transform"
          >
            💣
          </Link>
        </div>
      </div>
    </div>
  )
}
