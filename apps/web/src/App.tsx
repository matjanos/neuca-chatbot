import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { HomePage } from './pages/HomePage'
import { ChatPage } from './pages/ChatPage'
import { VoiceAssistantPage } from './pages/VoiceAssistantPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/chat/:id" element={<ChatPage />} />
        <Route path="/voice" element={<VoiceAssistantPage />} />
      </Routes>
    </BrowserRouter>
  )
}
