import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

interface ModalPortalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  className?: string
}

export default function ModalPortal({ isOpen, onClose, title, children, className }: ModalPortalProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title || 'Modal overlay'}
    >
      <div
        ref={containerRef}
        className={className || 'bg-widget-bg border border-widget-border rounded-2xl shadow-lg max-w-lg w-full p-6 relative z-[10000]'}
      >
        {children}
      </div>
    </div>,
    document.body
  )
}
