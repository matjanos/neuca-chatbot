import type { UIMessage } from '@ai-sdk/react'
import type { FormEvent } from 'react'
import { MessageList } from './MessageList'
import { InputBar } from './InputBar'

interface ChatContainerProps {
  messages: UIMessage[]
  input: string
  setInput: (value: string) => void
  handleSubmit: (e: FormEvent<HTMLFormElement>) => void
  isLoading: boolean
  status: string
  stop: () => void
  error?: Error
  retry?: () => void
  clearError?: () => void
  videoId?: string | null
}

// Helper to extract text content from a message
function getMessageText(message: UIMessage): string {
  return message.parts
    ?.filter((part) => part.type === 'text')
    .map((part) => {
      const p = part as { text?: string }
      return p.text || ''
    })
    .join('') || ''
}

// Helper to extract reasoning content from a message
function getMessageReasoning(message: UIMessage): string {
  return message.parts
    ?.filter((part) => part.type === 'reasoning')
    .map((part) => {
      const p = part as Record<string, unknown>
      return typeof p.reasoning === 'string' ? p.reasoning : ''
    })
    .join('') || ''
}

// Helper to check if message has only reasoning (no text yet)
function hasOnlyReasoning(message: UIMessage): boolean {
  const hasReasoning = message.parts?.some((part) => part.type === 'reasoning')
  const hasText = getMessageText(message).trim().length > 0
  return Boolean(hasReasoning) && !hasText
}

export function ChatContainer({
  messages,
  input,
  setInput,
  handleSubmit,
  isLoading,
  status,
  stop,
  error,
  retry,
  clearError,
  videoId,
}: ChatContainerProps) {
  const lastMessage = messages[messages.length - 1]

  // Determine what indicator to show
  // Show typing indicator when:
  // 1. Status is 'submitted' (before any streaming starts)
  // 2. Status is 'streaming' AND last message is from user (assistant hasn't started responding)
  const showTypingIndicator =
    status === 'submitted' ||
    (status === 'streaming' && lastMessage?.role === 'user')

  // Show thinking indicator when:
  // Status is 'streaming' AND last assistant message has reasoning but no text yet
  const showThinkingIndicator =
    status === 'streaming' &&
    lastMessage?.role === 'assistant' &&
    hasOnlyReasoning(lastMessage)

  // Get the reasoning content if showing thinking indicator
  const reasoningContent = showThinkingIndicator
    ? getMessageReasoning(lastMessage)
    : undefined

  return (
    <div className="h-full flex flex-col">
      <MessageList
        messages={messages}
        isLoading={isLoading}
        showTypingIndicator={showTypingIndicator}
        showThinkingIndicator={showThinkingIndicator}
        reasoningContent={reasoningContent}
        error={error}
        onRetry={retry}
        onDismissError={clearError}
        videoId={videoId}
      />
      <InputBar
        value={input}
        onChange={setInput}
        onSubmit={handleSubmit}
        isLoading={isLoading}
        onStop={stop}
      />
    </div>
  )
}
