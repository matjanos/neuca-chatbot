import { useState } from 'react'
import type { UIMessage } from '@ai-sdk/react'
import { ParsedMessageText } from './ParsedMessageText'
import { VideoModal } from '../video/VideoModal'

interface MessageProps {
  message: UIMessage
  videoId?: string | null
}

function ReasoningBlock({ reasoning }: { reasoning: string }) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="mb-2">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 text-gray-500 rounded-lg text-sm hover:bg-gray-150 transition-colors"
      >
        <svg
          className="w-3.5 h-3.5"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
            clipRule="evenodd"
          />
        </svg>
        <span>Rozumowanie</span>
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
      </button>

      {isExpanded && (
        <div className="mt-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-100">
          <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">
            {reasoning}
          </p>
        </div>
      )}
    </div>
  )
}

function ToolInvocationBlock({ toolName }: { toolName: string }) {
  return (
    <div className="mb-2 flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-sm">
      <svg
        className="w-3.5 h-3.5 animate-pulse"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          d="M14.5 10a4.5 4.5 0 004.284-5.882c-.105-.324-.51-.391-.752-.15L15.34 6.66a.454.454 0 01-.493.11 3.01 3.01 0 01-1.618-1.616.455.455 0 01.11-.494l2.694-2.692c.24-.241.174-.647-.15-.752a4.5 4.5 0 00-5.873 4.575c.055.873-.128 1.808-.8 2.368l-7.23 6.024a2.724 2.724 0 103.837 3.837l6.024-7.23c.56-.672 1.495-.855 2.368-.8.096.007.193.01.291.01z"
          clipRule="evenodd"
        />
      </svg>
      <span>Uzywanie: {toolName}</span>
    </div>
  )
}

// Helper to safely extract reasoning text from a part
function getReasoningText(part: unknown): string | null {
  if (typeof part === 'object' && part !== null) {
    const p = part as Record<string, unknown>
    if (typeof p.reasoning === 'string') {
      return p.reasoning
    }
  }
  return null
}

// Helper to safely extract tool name from a part
function getToolName(part: unknown): string | null {
  if (typeof part === 'object' && part !== null) {
    const p = part as Record<string, unknown>
    // Try nested toolInvocation first
    if (typeof p.toolInvocation === 'object' && p.toolInvocation !== null) {
      const ti = p.toolInvocation as Record<string, unknown>
      if (typeof ti.toolName === 'string') return ti.toolName
    }
    // Try direct toolName
    if (typeof p.toolName === 'string') return p.toolName
  }
  return null
}

export function Message({ message, videoId }: MessageProps) {
  const isUser = message.role === 'user'
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedTimestamp, setSelectedTimestamp] = useState(0)

  const handleTimestampClick = (startSeconds: number) => {
    setSelectedTimestamp(startSeconds)
    setModalOpen(true)
  }

  // Render message parts
  const renderParts = () => {
    if (!message.parts || message.parts.length === 0) {
      return null
    }

    return message.parts.map((part, index) => {
      if (part.type === 'text') {
        const text = (part as { text?: string }).text || ''
        if (!text.trim()) return null
        return (
          <p key={index} className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
            <ParsedMessageText
              text={text}
              videoId={videoId}
              onTimestampClick={handleTimestampClick}
            />
          </p>
        )
      }

      if (part.type === 'reasoning') {
        const reasoning = getReasoningText(part)
        if (reasoning) {
          return <ReasoningBlock key={index} reasoning={reasoning} />
        }
        return null
      }

      if (part.type === 'tool-invocation') {
        const toolName = getToolName(part)
        if (toolName) {
          return <ToolInvocationBlock key={index} toolName={toolName} />
        }
        return null
      }

      return null
    })
  }

  return (
    <>
      <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
        <div
          className={`
            max-w-[85%] md:max-w-[70%] px-4 py-3
            ${
              isUser
                ? 'bg-gray-100 text-text-primary rounded-2xl rounded-br-md'
                : 'bg-white text-text-primary rounded-2xl rounded-bl-md border border-gray-100 shadow-sm'
            }
          `}
        >
          {renderParts()}
        </div>
      </div>

      {videoId && (
        <VideoModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          videoId={videoId}
          startSeconds={selectedTimestamp}
        />
      )}
    </>
  )
}
