import { useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Layout } from '../components/layout/Layout'
import { ChatContainer } from '../components/chat/ChatContainer'
import { useNeucaChat } from '../hooks/useNeucaChat'

export function ChatPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const initialMessage = location.state?.initialMessage as string | undefined
  const hasSentInitialMessage = useRef(false)

  const {
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
  } = useNeucaChat()

  // Send initial message only once
  useEffect(() => {
    if (initialMessage && messages.length === 0 && !hasSentInitialMessage.current) {
      hasSentInitialMessage.current = true
      sendMessage(initialMessage)
    }
  }, [initialMessage, messages.length, sendMessage])

  const handleNewChat = () => {
    hasSentInitialMessage.current = false
    reset()
    navigate('/')
  }

  return (
    <Layout onNewChat={handleNewChat} showNewChat={true}>
      <ChatContainer
        messages={messages}
        input={input}
        setInput={setInput}
        handleSubmit={handleSubmit}
        isLoading={isLoading}
        status={status}
        stop={stop}
        error={error}
        retry={retry}
        clearError={clearError}
        videoId={videoId}
      />
    </Layout>
  )
}
