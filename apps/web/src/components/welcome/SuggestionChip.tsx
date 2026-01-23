interface SuggestionChipProps {
  text: string
  prompt: string
  onClick: (prompt: string) => void
}

export function SuggestionChip({ text, prompt, onClick }: SuggestionChipProps) {
  return (
    <button
      onClick={() => onClick(prompt)}
      className="
        group inline-flex items-center gap-2 px-4 py-2.5
        bg-white border border-gray-200 rounded-full
        text-sm text-text-primary font-medium
        hover:bg-gray-50 hover:border-gray-300 hover:shadow-sm
        transition-all duration-200
        focus:outline-none focus:ring-2 focus:ring-gray-200
      "
    >
      <span>{text}</span>
      <svg
        className="w-4 h-4 text-gray-400 group-hover:text-gray-600 group-hover:translate-x-0.5 transition-all"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
          clipRule="evenodd"
        />
      </svg>
    </button>
  )
}
