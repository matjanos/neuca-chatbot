import { useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'

interface VideoModalProps {
  isOpen: boolean
  onClose: () => void
  videoId: string
  startSeconds: number
}

export function VideoModal({
  isOpen,
  onClose,
  videoId,
  startSeconds,
}: VideoModalProps) {
  // Handle ESC key to close
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    },
    [onClose]
  )

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [isOpen, handleKeyDown])

  if (!isOpen) return null

  // Build YouTube embed URL with start time and autoplay
  const embedUrl = `https://www.youtube.com/embed/${videoId}?start=${Math.floor(startSeconds)}&autoplay=1&rel=0`

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl bg-black rounded-lg overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors"
          aria-label="Zamknij"
        >
          <svg
            className="w-5 h-5"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>

        {/* 16:9 aspect ratio container */}
        <div className="relative w-full pt-[56.25%]">
          <iframe
            className="absolute inset-0 w-full h-full"
            src={embedUrl}
            title="YouTube video player"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
      </div>
    </div>
  )

  // Render modal using portal to ensure proper z-index stacking
  return createPortal(modalContent, document.body)
}
