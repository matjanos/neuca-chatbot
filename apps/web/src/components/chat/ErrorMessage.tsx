interface ErrorMessageProps {
  error: Error
  onRetry: () => void
  onDismiss: () => void
}

export function ErrorMessage({ error, onRetry, onDismiss }: ErrorMessageProps) {
  return (
    <div className="flex justify-center px-4">
      <div className="max-w-md w-full bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            <svg
              className="w-5 h-5 text-red-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-red-800">
              Wystąpił problem z połączeniem
            </p>
            <p className="mt-1 text-sm text-red-700">
              {error.message || 'Nie udało się wysłać wiadomości. Sprawdź połączenie internetowe.'}
            </p>

            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={onRetry}
                className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
              >
                Spróbuj ponownie
              </button>
              <button
                onClick={onDismiss}
                className="px-3 py-1.5 text-sm font-medium text-red-700 hover:text-red-800 transition-colors"
              >
                Zamknij
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
