import { ReactNode } from 'react'
import { Header } from './Header'

interface LayoutProps {
  children: ReactNode
  onNewChat: () => void
  showNewChat: boolean
}

export function Layout({ children, onNewChat, showNewChat }: LayoutProps) {
  return (
    <div className="h-full flex flex-col bg-white">
      <Header onNewChat={onNewChat} showNewChat={showNewChat} />
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  )
}
