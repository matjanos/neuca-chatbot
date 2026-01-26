import { useEffect, useRef } from 'react'
import type { UIMessage } from '@ai-sdk/react'
import { Message } from './Message'
import { TypingIndicator } from './TypingIndicator'
import { ThinkingIndicator } from './ThinkingIndicator'
import { ErrorMessage } from './ErrorMessage'

interface MessageListProps {
  messages: UIMessage[]
  isLoading: boolean
  showTypingIndicator: boolean
  showThinkingIndicator?: boolean
  reasoningContent?: string
  error?: Error
  onRetry?: () => void
  onDismissError?: () => void
  videoId?: string | null
  messageTraceIds?: Record<string, string>
  status?: string
}

// Helper to check if message has visible content (text or non-empty reasoning)
function hasVisibleContent(message: UIMessage): boolean {
  // Check for text content
  const text = message.parts
    ?.filter((part) => part.type === 'text')
    .map((part) => (part as { type: 'text'; text: string }).text)
    .join('') || ''

  if (text.trim().length > 0) return true

  // Check for reasoning content (assistant messages with reasoning are visible)
  const hasReasoning = message.parts?.some((part) => part.type === 'reasoning')
  if (hasReasoning) return true

  return false
}

export function MessageList({
  messages,
  isLoading,
  showTypingIndicator,
  showThinkingIndicator = false,
  reasoningContent,
  error,
  onRetry,
  onDismissError,
  videoId,
  messageTraceIds,
  status,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  // Determine which message is currently streaming (if any)
  const streamingMessageId = (status === 'streaming' || status === 'submitted') && messages.length > 0
    ? messages[messages.length - 1]?.id
    : null

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading, error, showThinkingIndicator])

  // Filter out messages without visible content
  // But don't show messages that only have reasoning and are still streaming (handled by ThinkingIndicator)
  const visibleMessages = messages.filter((msg) => {
    if (msg.role === 'user') return true

    // Check if this is the last message and it's being shown as thinking indicator
    const isLastMessage = messages.indexOf(msg) === messages.length - 1
    if (isLastMessage && showThinkingIndicator) return false

    return hasVisibleContent(msg)
  })

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
      <div className="max-w-3xl mx-auto space-y-3">
        {visibleMessages.map((message) => (
          <Message
            key={message.id}
            message={message}
            videoId={videoId}
            traceId={message.role === 'assistant' ? messageTraceIds?.[message.id] : undefined}
            isStreaming={message.id === streamingMessageId}
          />
        ))}

        {showTypingIndicator && (
          <div className="flex justify-start">
            <TypingIndicator />
          </div>
        )}

        {showThinkingIndicator && (
          <ThinkingIndicator reasoning={reasoningContent} />
        )}

        {error && onRetry && onDismissError && (
          <ErrorMessage
            error={error}
            onRetry={onRetry}
            onDismiss={onDismissError}
          />
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  )
}
