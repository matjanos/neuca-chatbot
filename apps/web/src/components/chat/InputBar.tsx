import { FormEvent, KeyboardEvent, useRef, useEffect } from 'react'

interface InputBarProps {
  value: string
  onChange: (value: string) => void
  onSubmit: (e: FormEvent<HTMLFormElement>) => void
  isLoading: boolean
  onStop: () => void
}

export function InputBar({ value, onChange, onSubmit, isLoading, onStop }: InputBarProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      const minHeight = 44 // ~2 lines
      textareaRef.current.style.height = `${Math.max(minHeight, Math.min(textareaRef.current.scrollHeight, 200))}px`
    }
  }, [value])

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (value.trim() && !isLoading) {
        const form = e.currentTarget.form
        if (form) form.requestSubmit()
      }
    }
  }

  return (
    <div className="flex-shrink-0 border-t border-gray-100 bg-white px-4 py-3">
      <form onSubmit={onSubmit} className="max-w-3xl mx-auto">
        <div className="flex items-end gap-3 bg-gray-50 rounded-2xl px-4 py-3 border border-gray-200 focus-within:border-gray-300 focus-within:shadow-glow-sm transition-all">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Napisz wiadomosc..."
            rows={1}
            className="flex-1 bg-transparent resize-none outline-none text-text-primary placeholder:text-text-secondary text-[15px] min-h-[24px] max-h-[200px]"
            disabled={isLoading}
          />

          {isLoading ? (
            <button
              type="button"
              onClick={onStop}
              className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-red-500 hover:bg-red-600 text-white rounded-xl transition-colors"
              aria-label="Zatrzymaj generowanie"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-5 h-5"
              >
                <rect x="6" y="6" width="12" height="12" rx="1" />
              </svg>
            </button>
          ) : (
            <button
              type="submit"
              disabled={!value.trim()}
              className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-gray-800 hover:bg-gray-900 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-xl transition-colors"
              aria-label="Wyslij wiadomosc"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-5 h-5"
              >
                <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
              </svg>
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
