export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export interface Suggestion {
  title: string
  description: string
  prompt: string
}
