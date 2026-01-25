import { useChat, Chat, UIMessage } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useCallback, useEffect, useRef, useState } from 'react'

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
    // API URL: use environment variable or default to localhost:3000
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000'

    transportRef.current = new DefaultChatTransport<UIMessage>({
      api: `${apiUrl}/api/chat`,
      fetch: customFetch,
    })
  }

  // Track if we're in an auto-retry to prevent duplicate retries
  const isAutoRetryingRef = useRef(false)
  const retryCountRef = useRef(0)

  // Create stable Chat instance - only once
  const chatRef = useRef<Chat<UIMessage> | null>(null)
  if (!chatRef.current) {
    chatRef.current = new Chat<UIMessage>({
      transport: transportRef.current,
      onError: (err) => {
        console.error('💥 Chat error detected:', err.message)

        // Check if this is a transient error worth auto-retrying
        const isTransient =
          err.message.toLowerCase().includes('fetch') ||
          err.message.toLowerCase().includes('network') ||
          err.message.toLowerCase().includes('connection') ||
          err.message.toLowerCase().includes('timeout') ||
          err.message.toLowerCase().includes('stream') ||
          err.message.toLowerCase().includes('closed') ||
          err.message.toLowerCase().includes('aborted') ||
          err.message.toLowerCase().includes('econnreset') ||
          err.message.toLowerCase().includes('socket')

        // If we have a saved message and haven't exhausted retries, auto-retry
        if (isTransient && lastUserMessageRef.current && !isAutoRetryingRef.current && retryCountRef.current < 3) {
          isAutoRetryingRef.current = true
          retryCountRef.current++
          console.log(`🔄 Auto-recovering from stream error (attempt ${retryCountRef.current}/3)...`)

          // Wait before retry with progressive backoff
          const delay = 1000 + (retryCountRef.current - 1) * 500
          setTimeout(() => {
            const messageToRetry = lastUserMessageRef.current
            if (messageToRetry && chatRef.current) {
              console.log(`📤 Retrying message: "${messageToRetry.slice(0, 50)}..."`)

              // Remove failed messages
              setMessages((prev) => {
                const lastMessage = prev[prev.length - 1]
                if (lastMessage?.role === 'user') {
                  return prev.slice(0, -1)
                }
                if (prev.length >= 2 && prev[prev.length - 2]?.role === 'user') {
                  return prev.slice(0, -2)
                }
                return prev
              })

              // Small delay to let UI update
              setTimeout(() => {
                if (chatRef.current) {
                  // Retry the message
                  chatRef.current.sendMessage({ text: messageToRetry })
                    .then(() => {
                      console.log(`✓ Auto-recovery successful after ${retryCountRef.current} attempt(s)`)
                      retryCountRef.current = 0
                      isAutoRetryingRef.current = false
                    })
                    .catch((retryErr) => {
                      console.error('❌ Auto-recovery attempt failed:', retryErr.message)
                      isAutoRetryingRef.current = false
                    })
                } else {
                  isAutoRetryingRef.current = false
                }
              }, 100)
            } else {
              isAutoRetryingRef.current = false
            }
          }, delay)
        } else if (!isTransient) {
          console.log('⚠️ Non-transient error, not auto-retrying:', err.message)
        } else if (retryCountRef.current >= 3) {
          console.log('❌ Retry limit exhausted, showing error to user')
        }
      },
    })
  }

  const { messages, setMessages, status, stop, error, clearError } = useChat({
    chat: chatRef.current,
  })

  // Monitor for stuck streams (timeout detection) and error states
  const streamStartTimeRef = useRef<number | null>(null)
  const timeoutCheckIntervalRef = useRef<number | null>(null)
  const lastStatusRef = useRef<typeof status>(status)

  useEffect(() => {
    // Detect error state transitions
    if (status === 'error' && lastStatusRef.current !== 'error' && error) {
      console.log('🔴 Status changed to error:', error.message)

      // Trigger auto-recovery if appropriate
      const isTransient =
        error.message.toLowerCase().includes('fetch') ||
        error.message.toLowerCase().includes('network') ||
        error.message.toLowerCase().includes('connection') ||
        error.message.toLowerCase().includes('timeout') ||
        error.message.toLowerCase().includes('stream') ||
        error.message.toLowerCase().includes('closed') ||
        error.message.toLowerCase().includes('aborted')

      if (isTransient && lastUserMessageRef.current && !isAutoRetryingRef.current && retryCountRef.current < 3) {
        isAutoRetryingRef.current = true
        retryCountRef.current++
        console.log(`🔄 Auto-recovering from error state (attempt ${retryCountRef.current}/3)...`)

        const delay = 1000 + (retryCountRef.current - 1) * 500
        setTimeout(() => {
          const messageToRetry = lastUserMessageRef.current
          if (messageToRetry && chatRef.current) {
            clearError()

            // Remove failed messages
            setMessages((prev) => {
              const lastMessage = prev[prev.length - 1]
              if (lastMessage?.role === 'user') {
                return prev.slice(0, -1)
              }
              if (prev.length >= 2 && prev[prev.length - 2]?.role === 'user') {
                return prev.slice(0, -2)
              }
              return prev
            })

            // Small delay to let UI update
            setTimeout(() => {
              if (chatRef.current) {
                chatRef.current.sendMessage({ text: messageToRetry })
                  .then(() => {
                    console.log(`✓ Error state recovery successful after ${retryCountRef.current} attempt(s)`)
                    retryCountRef.current = 0
                    isAutoRetryingRef.current = false
                  })
                  .catch((retryErr) => {
                    console.error('❌ Error state recovery failed:', retryErr.message)
                    isAutoRetryingRef.current = false
                  })
              } else {
                isAutoRetryingRef.current = false
              }
            }, 100)
          } else {
            isAutoRetryingRef.current = false
          }
        }, delay)
      }
    }

    lastStatusRef.current = status

    if (status === 'streaming' || status === 'submitted') {
      // Stream started, record time
      if (!streamStartTimeRef.current) {
        streamStartTimeRef.current = Date.now()
        console.log('🔵 Stream started')
      }

      // Set up timeout checker (every 2 seconds)
      if (!timeoutCheckIntervalRef.current) {
        timeoutCheckIntervalRef.current = setInterval(() => {
          const elapsed = Date.now() - (streamStartTimeRef.current || 0)
          const TIMEOUT_MS = 30000 // 30 second timeout

          if (elapsed > TIMEOUT_MS) {
            console.error(`⏱️ Stream timeout after ${elapsed}ms - triggering auto-recovery`)
            clearInterval(timeoutCheckIntervalRef.current!)
            timeoutCheckIntervalRef.current = null

            // Trigger recovery for stuck stream
            if (chatRef.current && lastUserMessageRef.current && !isAutoRetryingRef.current && retryCountRef.current < 3) {
              stop() // Stop the stuck stream
              isAutoRetryingRef.current = true
              retryCountRef.current++

              setTimeout(() => {
                const messageToRetry = lastUserMessageRef.current
                if (messageToRetry && chatRef.current) {
                  // Remove failed messages
                  setMessages((prev) => {
                    const lastMessage = prev[prev.length - 1]
                    if (lastMessage?.role === 'user') {
                      return prev.slice(0, -1)
                    }
                    if (prev.length >= 2 && prev[prev.length - 2]?.role === 'user') {
                      return prev.slice(0, -2)
                    }
                    return prev
                  })

                  // Retry the message
                  chatRef.current.sendMessage({ text: messageToRetry })
                    .then(() => {
                      console.log(`✓ Timeout recovery successful after ${retryCountRef.current} attempt(s)`)
                      retryCountRef.current = 0
                    })
                    .catch((retryErr) => {
                      console.error('Timeout recovery failed:', retryErr)
                    })
                    .finally(() => {
                      isAutoRetryingRef.current = false
                    })
                } else {
                  isAutoRetryingRef.current = false
                }
              }, 1000 + retryCountRef.current * 500)
            }
          }
        }, 2000)
      }
    } else {
      // Stream ended, clear timeout monitor
      if (timeoutCheckIntervalRef.current) {
        clearInterval(timeoutCheckIntervalRef.current)
        timeoutCheckIntervalRef.current = null
      }
      if (streamStartTimeRef.current && (status === 'ready' || status === 'error')) {
        const duration = Date.now() - streamStartTimeRef.current
        console.log(`✅ Stream completed in ${duration}ms (status: ${status})`)
        streamStartTimeRef.current = null
      }
    }

    return () => {
      if (timeoutCheckIntervalRef.current) {
        clearInterval(timeoutCheckIntervalRef.current)
      }
    }
  }, [status, stop, setMessages, error, clearError])

  const sendMessage = useCallback(
    async (content: string, isAutoRetry = false) => {
      if (!content.trim() || !chatRef.current) return
      lastUserMessageRef.current = content
      if (!isAutoRetry) {
        setInput('')
      }

      const maxRetries = 3 // Increased from 2 to 3 for better resilience

      // Helper to determine if an error is transient and should be retried
      const isTransientError = (error: Error): boolean => {
        const message = error.message.toLowerCase()
        // Transient network/stream errors that should be auto-retried
        return (
          message.includes('fetch') ||
          message.includes('network') ||
          message.includes('connection') ||
          message.includes('timeout') ||
          message.includes('stream') ||
          message.includes('closed') ||
          message.includes('aborted') ||
          message.includes('econnreset') ||
          message.includes('socket hang up') ||
          // Generic errors that are often transient
          !message.includes('pii') && // Don't retry PII detection errors
          !message.includes('unauthorized') && // Don't retry auth errors
          !message.includes('forbidden') // Don't retry permission errors
        )
      }

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          if (attempt > 0) {
            console.log(`Auto-retrying message (attempt ${attempt + 1}/${maxRetries + 1})...`)
            // Remove the failed message(s) before retrying
            setMessages((prev) => {
              const lastMessage = prev[prev.length - 1]
              // If last message is from user (error before assistant responded), remove it
              if (lastMessage?.role === 'user') {
                return prev.slice(0, -1)
              }
              // If last message is from assistant (partial response), remove both user and assistant
              if (prev.length >= 2 && prev[prev.length - 2]?.role === 'user') {
                return prev.slice(0, -2)
              }
              return prev
            })
            // Progressive backoff: 1s, 1.5s, 2s
            await new Promise((resolve) => setTimeout(resolve, 1000 + attempt * 500))
          }

          await chatRef.current.sendMessage({ text: content })

          // Success! Reset retry counter and log if this was a retry
          retryCountRef.current = 0
          if (attempt > 0) {
            console.log(`✓ Retry successful after ${attempt} attempt(s)`)
          }
          return // Success, exit retry loop
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error))

          // Never retry user-initiated aborts
          if (err.name === 'AbortError') {
            console.log('Message sending aborted by user')
            throw err
          }

          // Check if this is a transient error worth retrying
          const shouldRetry = isTransientError(err)

          console.error(
            `Message send failed (attempt ${attempt + 1}/${maxRetries + 1}):`,
            err.message,
            shouldRetry ? '[will retry]' : '[permanent error]'
          )

          // If it's not transient or we've exhausted retries, surface the error
          if (!shouldRetry || attempt === maxRetries) {
            throw err
          }
        }
      }
    },
    [setMessages]
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

    // Clear error state
    clearError()

    // Remove failed message(s) before manual retry
    setMessages((prev) => {
      const lastMessage = prev[prev.length - 1]
      // If last message is from user (error before assistant responded), remove it
      if (lastMessage?.role === 'user') {
        return prev.slice(0, -1)
      }
      // If last message is from assistant (partial response), remove both user and assistant
      if (prev.length >= 2 && prev[prev.length - 2]?.role === 'user') {
        return prev.slice(0, -2)
      }
      return prev
    })

    // Small delay to let UI update
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Send the message fresh (this will add it back once)
    await chatRef.current.sendMessage({ text: lastUserMessageRef.current })
  }, [clearError, setMessages])

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
