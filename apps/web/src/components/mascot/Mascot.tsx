import { useState, useEffect, useRef } from 'react'

interface MascotProps {
  className?: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
  animate?: boolean
}

// Looking around frames (slow cycle)
const LOOK_FRAMES = ['/clippy_0.png', '/clippy_1.png', '/clippy_2.png', '/clippy_1.png']
const CLIPPY_CLOSED = '/clippy_closed.png'

export function Mascot({ className = '', size = 'md', animate = true }: MascotProps) {
  const [currentFrame, setCurrentFrame] = useState('/clippy_1.png')
  const [isBlinking, setIsBlinking] = useState(false)
  const lookIndexRef = useRef(0)

  useEffect(() => {
    if (!animate) return

    // Slow look-around animation (change every 2.5 seconds)
    const lookInterval = setInterval(() => {
      lookIndexRef.current = (lookIndexRef.current + 1) % LOOK_FRAMES.length
      setCurrentFrame(LOOK_FRAMES[lookIndexRef.current])
    }, 2500)

    // Random blink every 3-6 seconds
    const scheduleBlink = () => {
      const delay = 3000 + Math.random() * 3000
      return setTimeout(() => {
        setIsBlinking(true)
        // Eyes closed for 150-250ms
        setTimeout(() => {
          setIsBlinking(false)
          blinkTimeoutId = scheduleBlink()
        }, 150 + Math.random() * 100)
      }, delay)
    }

    let blinkTimeoutId = scheduleBlink()

    return () => {
      clearInterval(lookInterval)
      clearTimeout(blinkTimeoutId)
    }
  }, [animate])

  const sizeClasses = {
    xs: 'w-10 h-10',
    sm: 'w-16 h-16',
    md: 'w-48 h-48',
    lg: 'w-64 h-64',
  }

  return (
    <div className={`${sizeClasses[size]} ${className}`}>
      <img
        src={isBlinking ? CLIPPY_CLOSED : currentFrame}
        alt="Clippy assistant"
        className="w-full h-full object-contain"
      />
    </div>
  )
}
