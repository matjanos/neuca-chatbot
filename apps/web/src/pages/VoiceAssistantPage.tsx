import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Mascot } from '../components/mascot/Mascot'

const AGENT_ID = 'agent_8301kfth6cgwfmxvqv3dyhsarxwv'

type AnimationPhase = 'intro' | 'text' | 'transition' | 'ready'

export function VoiceAssistantPage() {
  const widgetRef = useRef<HTMLElement | null>(null)
  const [phase, setPhase] = useState<AnimationPhase>('intro')

  // Animation sequence timer
  useEffect(() => {
    const t1 = setTimeout(() => setPhase('text'), 500)        // Show text
    const t2 = setTimeout(() => setPhase('transition'), 3000) // Start fade
    const t3 = setTimeout(() => setPhase('ready'), 3800)      // Show content
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [])

  useEffect(() => {
    const customStyles = `
      /* Hide chat input */
      textarea, input[type="text"], input[type="search"] { display: none !important; }
      form, [class*="input"], [class*="Input"], [class*="message"], [class*="Message"] { display: none !important; }

      /* Hide collapse/minimize button */
      [class*="collapse"], [class*="Collapse"], [class*="minimize"], [class*="Minimize"],
      [class*="close"], [class*="Close"], [aria-label*="collapse"], [aria-label*="minimize"],
      [aria-label*="close"] { display: none !important; }

      /* Make widget container transparent */
      div { background: transparent !important; background-color: transparent !important; box-shadow: none !important; }
    `

    let hasOpened = false
    let observer: MutationObserver | null = null

    const customizeWidget = () => {
      const widget = widgetRef.current
      if (!widget?.shadowRoot) return
      const shadow = widget.shadowRoot

      // Inject CSS immediately
      if (!shadow.querySelector('#custom-widget-styles')) {
        const style = document.createElement('style')
        style.id = 'custom-widget-styles'
        style.textContent = customStyles
        shadow.prepend(style)
      }

      // Auto-open widget once
      if (!hasOpened) {
        for (const btn of shadow.querySelectorAll('button')) {
          const rect = btn.getBoundingClientRect()
          if (rect.width > 30 && rect.height > 30) {
            btn.click()
            hasOpened = true
            break
          }
        }
      }

      // Apply inline styles
      shadow.querySelectorAll('div').forEach((div) => {
        div.style.background = 'transparent'
        div.style.backgroundColor = 'transparent'
        div.style.boxShadow = 'none'
      })

      shadow.querySelectorAll('textarea, input, form').forEach((el) => {
        (el as HTMLElement).style.display = 'none'
        ;(el as HTMLElement).parentElement?.style.setProperty('display', 'none')
      })

      shadow.querySelectorAll('button').forEach((btn) => {
        const text = btn.textContent?.toLowerCase() || ''
        const label = btn.getAttribute('aria-label')?.toLowerCase() || ''
        if (text.includes('call') || text.includes('start') || label.includes('call')) return
        const rect = btn.getBoundingClientRect()
        if (rect.width > 0 && rect.width < 40) btn.style.display = 'none'
        if (text.includes('send') || text.includes('close') || text.includes('minimize')) btn.style.display = 'none'
      })

      shadow.querySelectorAll('p, span, a').forEach((el) => {
        const text = el.textContent?.toLowerCase() || ''
        if (text.includes('powered by') || text.includes('elevenlabs') || text.includes('agents')) {
          ;(el as HTMLElement).style.fontSize = '10px'
          ;(el as HTMLElement).style.opacity = '0.5'
        }
      })
    }

    const loadWidget = async () => {
      if (!document.querySelector('script[src*="elevenlabs"]')) {
        const script = document.createElement('script')
        script.src = 'https://unpkg.com/@elevenlabs/convai-widget-embed'
        script.async = true
        script.type = 'text/javascript'
        document.body.appendChild(script)
        await new Promise((resolve) => { script.onload = resolve })
      }

      await customElements.whenDefined('elevenlabs-convai')

      // Poll rapidly until shadow root exists, then set up observer
      const poll = () => {
        const widget = widgetRef.current
        if (widget?.shadowRoot) {
          customizeWidget()
          observer = new MutationObserver(() => requestAnimationFrame(customizeWidget))
          observer.observe(widget.shadowRoot, { childList: true, subtree: true, attributes: true })
        } else {
          requestAnimationFrame(poll)
        }
      }
      requestAnimationFrame(poll)
    }

    // Only load widget after animation is complete
    if (phase !== 'ready') return

    loadWidget()

    return () => observer?.disconnect()
  }, [phase])

  return (
    <div className="voice-page">
      {/* Intro overlay - renders during intro/text/transition phases */}
      {phase !== 'ready' && (
        <div className={`voice-intro ${phase === 'text' ? 'voice-intro--text' : ''} ${phase === 'transition' ? 'voice-intro--fade' : ''}`}>
          <h1 className="voice-intro-text">Jest jeszcze jedna rzecz...</h1>
        </div>
      )}

      {/* Main content - only visible when ready */}
      <div className={`voice-content ${phase === 'ready' ? 'voice-content--visible' : ''}`}>
        {/* Background grid */}
        <div className="voice-grid" />

        {/* Mascot at top center */}
        <div className="voice-mascot-top">
          <Mascot size="lg" animate />
        </div>

        {/* White box backdrop for widget */}
        <div className="voice-widget-backdrop" />

        {/* ElevenLabs widget - only load after animation complete */}
        {phase === 'ready' && (
          /* @ts-expect-error - ElevenLabs custom element */
          <elevenlabs-convai
            language="pl"
            ref={widgetRef}
            agent-id={AGENT_ID}
          />
        )}

        {/* Back button at bottom */}
        <Link to="/" className="voice-back-btn">
          ← Wróć do czatu
        </Link>
      </div>
    </div>
  )
}
