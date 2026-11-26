import { useEffect } from 'react'

export function Modal({
  title,
  wide,
  locked = false,
  onClose,
  children,
}: {
  title: string
  wide?: boolean
  // While true, neither Escape nor the close button closes it (for work that must finish).
  locked?: boolean
  onClose: () => void
  children: React.ReactNode
}) {
  useEffect(() => {
    if (locked) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, locked])

  return (
    <div className="overlay">
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modalhead">
          <h2>{title}</h2>
          <button className="ghost" aria-label="Close" disabled={locked} onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modalbody">{children}</div>
      </div>
    </div>
  )
}
