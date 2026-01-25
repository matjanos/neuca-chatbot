import { useChat, Chat, UIMessage } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useCallback, useRef, useState } from 'react'

export function useNeucaChat() {
  const [input, setInput] = useState('')
  const [videoId, setVideoId] = useState<string | null>(null)
  const lastUserMessageRef = useRef<string>('')

  // Create custom fetch that captures video ID from response headers
  // Includes retry logic for API errors (max 2 retries)
  const customFetch = useCallback(async (url: string | URL | Request, options?: RequestInit) => {
    const maxRetries = 2
    let lastError: Error | null = null

    // Helper to check if error is retryable
    const isRetryable = (error: Error, status?: number): boolean => {
      // Don't retry user aborts
      if (error.name === 'AbortError') return false
      // Don't retry client errors (4xx) - these are intentional rejections
      if (status && status >= 400 && status < 500) return false
      // Retry network errors and server errors (5xx)
      return true
    }

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`Retrying API call (attempt ${attempt + 1}/${maxRetries + 1})...`)
        }

        const response = await fetch(url, options)

        // Handle error responses (e.g., PII detection)
        if (!response.ok) {
          const contentType = response.headers.get('content-type')
          let errorMessage = `Request failed with status ${response.status}`

          if (contentType?.includes('application/json')) {
            const errorData = await response.json()
            errorMessage = errorData.error || errorMessage
          }

          const error = new Error(errorMessage)

          // Check if this error should be retried
          if (!isRetryable(error, response.status)) {
            throw error
          }

          // For retryable server errors, continue to retry logic below
          throw error
        }

        // Extract video ID from response headers
        const vid = response.headers.get('X-Video-Id')
        if (vid) {
          setVideoId(vid)
        }

        return response
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        // Don't retry non-retryable errors
        if (!isRetryable(lastError)) {
          throw lastError
        }

        console.error(`API call failed (attempt ${attempt + 1}/${maxRetries + 1}):`, lastError.message)

        if (attempt === maxRetries) {
          throw lastError
        }

        // Small delay before retry
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }

    throw lastError ?? new Error('Failed to get response from API')
  }, [])

  // Create stable transport - only once
  const transportRef = useRef<DefaultChatTransport<UIMessage> | null>(null)
  if (!transportRef.current) {
    transportRef.current = new DefaultChatTransport<UIMessage>({
      api: '/api/chat',
      fetch: customFetch,
    })
  }

  // Create stable Chat instance - only once
  const chatRef = useRef<Chat<UIMessage> | null>(null)
  if (!chatRef.current) {
    chatRef.current = new Chat<UIMessage>({
      transport: transportRef.current,
      onError: (err) => {
        console.error('Chat error:', err)
      },
    })
  }

  const { messages, setMessages, status, stop, error, clearError } = useChat({
    chat: chatRef.current,
  })

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || !chatRef.current) return
      lastUserMessageRef.current = content
      setInput('')

      const maxRetries = 2

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          if (attempt > 0) {
            console.log(`Retrying message send (attempt ${attempt + 1}/${maxRetries + 1})...`)
          }
          await chatRef.current.sendMessage({ text: content })
          return // Success, exit retry loop
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error))

          // Don't retry user-initiated aborts
          if (err.name === 'AbortError') {
            throw err
          }

          console.error(`Message send failed (attempt ${attempt + 1}/${maxRetries + 1}):`, err.message)

          if (attempt === maxRetries) {
            throw err
          }

          // Small delay before retry
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
      }
    },
    []
  )

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      if (!input.trim()) return
      await sendMessage(input)
    },
    [input, sendMessage]
  )

  const retry = useCallback(async () => {
    if (!lastUserMessageRef.current || !chatRef.current) return
    clearError()
    await chatRef.current.sendMessage({ text: lastUserMessageRef.current })
  }, [clearError])

  const reset = useCallback(() => {
    setMessages([])
    setInput('')
    lastUserMessageRef.current = ''
    clearError()
  }, [setMessages, clearError])

  const isLoading = status === 'streaming' || status === 'submitted'

  return {
    messages,
    input,
    setInput,
    handleSubmit,
    isLoading,
    status,
    sendMessage,
    stop,
    reset,
    error,
    retry,
    clearError,
    videoId,
  }
}
