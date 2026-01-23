import { useChat, Chat, UIMessage } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useCallback, useRef, useState } from 'react'

export function useNeucaChat() {
  const [input, setInput] = useState('')
  const lastUserMessageRef = useRef<string>('')

  // Create stable transport - only once
  const transportRef = useRef<DefaultChatTransport<UIMessage> | null>(null)
  if (!transportRef.current) {
    transportRef.current = new DefaultChatTransport<UIMessage>({ api: '/api/chat' })
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
      await chatRef.current.sendMessage({ text: content })
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
  }
}
