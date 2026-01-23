import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { WelcomeScreen } from '../components/welcome/WelcomeScreen'
import { Layout } from '../components/layout/Layout'

export function HomePage() {
  const navigate = useNavigate()

  const handleStartChat = useCallback(
    (message: string) => {
      // Generate a new chat ID
      const chatId = `id-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
      // Navigate to chat page with the message as state
      navigate(`/chat/${chatId}`, { state: { initialMessage: message } })
    },
    [navigate]
  )

  return (
    <Layout onNewChat={() => navigate('/')} showNewChat={false}>
      <WelcomeScreen
        onSuggestionClick={handleStartChat}
        input=""
        setInput={() => {}}
        onSubmit={() => {}}
      />
    </Layout>
  )
}
