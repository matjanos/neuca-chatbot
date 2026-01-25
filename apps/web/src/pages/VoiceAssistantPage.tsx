import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Mascot } from '../components/mascot/Mascot'

const AGENT_ID = 'agent_8301kfth6cgwfmxvqv3dyhsarxwv'

export function VoiceAssistantPage() {
  const widgetRef = useRef<HTMLElement | null>(null)

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

    loadWidget()

    return () => observer?.disconnect()
  }, [])

  return (
    <div className="voice-page">
      {/* Background grid */}
      <div className="voice-grid" />

      {/* Mascot at top center */}
      <div className="voice-mascot-top">
        <Mascot size="lg" animate />
      </div>

      {/* White box backdrop for widget */}
      <div className="voice-widget-backdrop" />

      {/* ElevenLabs widget - renders as fixed overlay in bottom right */}
      {/* @ts-expect-error - ElevenLabs custom element */}
      <elevenlabs-convai
        language="pl"
        ref={widgetRef}
        agent-id={AGENT_ID}
      />

      {/* Back button at bottom */}
      <Link to="/" className="voice-back-btn">
        ← Wróć do czatu
      </Link>
    </div>
  )
}
