import { useEffect } from 'react'
import { LEGAL_DOCS, LEGAL_ORDER, type LegalDoc } from './legalContent'

function renderBody(body: string) {
  // Blank lines split blocks; a block starting with "## " is a heading.
  return body.split(/\n\s*\n/).map((block, i) => {
    const trimmed = block.trim()
    if (trimmed.startsWith('## ')) {
      return (
        <h3 key={i} style={{ margin: '18px 0 6px', fontSize: 15 }}>
          {trimmed.slice(3)}
        </h3>
      )
    }
    return (
      <p key={i} style={{ margin: '0 0 10px', color: 'var(--muted)', fontSize: 13.5 }}>
        {trimmed}
      </p>
    )
  })
}

export function LegalModal({ doc, onClose }: { doc: LegalDoc['id']; onClose: () => void }) {
  const d = LEGAL_DOCS[doc]

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wide" role="dialog" aria-modal="true" aria-label={d.title}>
        <div className="modalhead">
          <h2>{d.title}</h2>
          <button className="ghost" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modalbody" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {renderBody(d.body)}
        </div>
      </div>
    </div>
  )
}

// Policy links, reachable before anyone signs up.
export function LegalFooter({ onOpen }: { onOpen: (id: LegalDoc['id']) => void }) {
  return (
    <p className="sharefoot" style={{ marginTop: 16 }}>
      {LEGAL_ORDER.map((id, i) => (
        <span key={id}>
          {i > 0 && <span aria-hidden="true"> · </span>}
          <button
            className="linklike"
            style={{ display: 'inline', width: 'auto', margin: 0, padding: 0 }}
            onClick={() => onOpen(id)}
          >
            {LEGAL_DOCS[id].title}
          </button>
        </span>
      ))}
    </p>
  )
}
