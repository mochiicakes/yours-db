import { useEffect, useRef, useState } from 'react'

/**
 * The account menu.
 *
 * Closes on outside click, on Escape, and on choosing anything — three exits,
 * because a menu that traps you is worse than one that closes too eagerly.
 * Sign out sits last and apart, so it is never the thing you hit by accident
 * on the way to Settings.
 */
export function UserMenu({
  email,
  onProfile,
  onSettings,
  onSupport,
  onSignOut,
}: {
  email: string
  onProfile: () => void
  onSettings: () => void
  onSupport: () => void
  onSignOut: () => void
}) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const initial = (email.trim()[0] ?? '?').toUpperCase()

  function choose(action: () => void) {
    setOpen(false)
    action()
  }

  return (
    <div className="usermenu" ref={wrap}>
      <button
        className="userbtn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="avatar">{initial}</span>
        <span className="userchevron" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <div className="menu" role="menu">
          <div className="menuhead">
            <span className="avatar big">{initial}</span>
            <span className="menuemail">{email}</span>
          </div>
          <button role="menuitem" onClick={() => choose(onProfile)}>
            Profile
          </button>
          <button role="menuitem" onClick={() => choose(onSettings)}>
            Settings
          </button>
          <button role="menuitem" onClick={() => choose(onSupport)}>
            Contact support
          </button>
          <div className="menusep" />
          <button role="menuitem" className="menudanger" onClick={() => choose(onSignOut)}>
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
