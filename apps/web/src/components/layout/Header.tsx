import { Mascot } from '../mascot/Mascot'

interface HeaderProps {
  onNewChat: () => void
  showNewChat: boolean
}

export function Header({ onNewChat, showNewChat }: HeaderProps) {
  return (
    <header className="flex-shrink-0 border-b border-gray-100 bg-white/80 backdrop-blur-sm">
      <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mascot size="xs" animate={false} />
          <span className="font-semibold text-text-primary">Neuca Chat</span>
        </div>

        {showNewChat && (
          <button
            onClick={onNewChat}
            className="group relative p-2.5 text-gray-500 hover:text-text-primary hover:bg-gray-100 rounded-xl transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-gray-200"
            aria-label="Nowy czat"
          >
            {/* Plus icon */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-5 h-5"
            >
              <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
            </svg>

            {/* Tooltip */}
            <span className="absolute right-0 top-full mt-2 px-2 py-1 text-xs font-medium text-white bg-gray-800 rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
              Nowy czat
            </span>
          </button>
        )}
      </div>
    </header>
  )
}
