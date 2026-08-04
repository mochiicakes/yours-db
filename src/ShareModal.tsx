import { useEffect, useState } from 'react'
import { supabase } from './db'
import { newToken } from './Shared'

/**
 * Creating and revoking share links for one sheet or workspace.
 *
 * Revoking is immediate and irreversible — the row stays so the view count
 * remains visible, but `get_shared` stops returning anything for that token.
 * There is deliberately no "un-revoke": once a link has been called back, the
 * only safe assumption is that whoever had it still has it.
 * 
 * insert below notice
 * {hasSecrets && (
            <p className="help">
              Secret columns are never included in a shared view. They are removed on the
              server, not hidden in the page.
            </p>
          )}
 */

export interface Share {
  id: string
  token: string
  scope: 'sheet' | 'workspace'
  sheet_id: string | null
  workspace_id: string | null
  label: string
  revoked: boolean
  expires_at: string | null
  last_seen_at: string | null
  view_count: number
  created_at: string
}

const EXPIRY_CHOICES: { label: string; days: number | null }[] = [
  { label: 'No expiry', days: null },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
]

export function ShareModal({
  scope,
  targetId,
  targetName,
  //hasSecrets,
  onClose,
}: {
  scope: 'sheet' | 'workspace'
  targetId: string
  targetName: string
  /** True if anything in scope has a secret column, so we can say what happens. */
  //hasSecrets: boolean
  onClose: () => void
}) {
  const [shares, setShares] = useState<Share[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [expiry, setExpiry] = useState<number | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const column = scope === 'sheet' ? 'sheet_id' : 'workspace_id'

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    let alive = true
    void supabase
      .from('shares')
      .select('*')
      .eq(column, targetId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!alive) return
        if (error) setProblem(error.message)
        else setShares((data ?? []) as Share[])
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [column, targetId])

  function linkFor(token: string): string {
    return `${window.location.origin}/?s=${token}`
  }

  async function create() {
    setBusy(true)
    setProblem(null)
    const { data: user } = await supabase.auth.getUser()
    if (!user.user) {
      setProblem('You are signed out.')
      setBusy(false)
      return
    }
    const { data, error } = await supabase
      .from('shares')
      .insert({
        owner_id: user.user.id,
        token: newToken(),
        scope,
        [column]: targetId,
        label: targetName,
        expires_at: expiry
          ? new Date(Date.now() + expiry * 86_400_000).toISOString()
          : null,
      })
      .select()
      .single()
    setBusy(false)
    if (error) {
      setProblem(error.message)
      return
    }
    const made = data as Share
    setShares((prev) => [made, ...prev])
    void copy(made)
  }

  async function copy(share: Share) {
    try {
      await navigator.clipboard.writeText(linkFor(share.token))
      setCopiedId(share.id)
      window.setTimeout(() => setCopiedId(null), 1800)
    } catch {
      setProblem('Could not reach the clipboard — select the link and copy it manually.')
    }
  }

  async function revoke(share: Share) {
    if (
      !window.confirm(
        'Revoke this link? Anyone holding it loses access immediately, and it cannot be re-enabled.',
      )
    ) {
      return
    }
    setBusy(true)
    const { error } = await supabase
      .from('shares')
      .update({ revoked: true })
      .eq('id', share.id)
    setBusy(false)
    if (error) {
      setProblem(error.message)
      return
    }
    setShares((prev) => prev.map((s) => (s.id === share.id ? { ...s, revoked: true } : s)))
  }

  const live = shares.filter((s) => !s.revoked)

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wide" role="dialog" aria-modal="true">
        <div className="modalhead">
          <h2>Share — {targetName}</h2>
          <button className="ghost" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modalbody">
          <div className="notice">
            <b>Anyone with the link can view this — no sign-in required.</b> They cannot
            edit, add or delete anything. Treat a link as public: once it is sent, you
            cannot control where it goes, only revoke it.
          </div>

          

          {problem && <div className="alert">{problem}</div>}

          <div className="field">
            <label htmlFor="share_expiry">New link expires</label>
            <div className="listrow">
              <select
                id="share_expiry"
                value={expiry === null ? '' : String(expiry)}
                onChange={(e) => setExpiry(e.target.value ? Number(e.target.value) : null)}
              >
                {EXPIRY_CHOICES.map((c) => (
                  <option key={c.label} value={c.days === null ? '' : String(c.days)}>
                    {c.label}
                  </option>
                ))}
              </select>
              <button className="primary" disabled={busy} onClick={() => void create()}>
                {busy ? 'Working…' : 'Create link'}
              </button>
            </div>
          </div>

          {loading ? (
            <div className="booting">Loading…</div>
          ) : !shares.length ? (
            <div className="hollow">No links yet.</div>
          ) : (
            <ul className="sharelist">
              {shares.map((s) => (
                <li key={s.id} className={`shareitem${s.revoked ? ' dead' : ''}`}>
                  <div className="sharemain">
                    <code className="sharelink">
                      {s.revoked ? 'revoked' : linkFor(s.token)}
                    </code>
                    <span className="sharemeta">
                      {[
                        s.scope === 'workspace' ? 'whole workspace' : 'this sheet',
                        `${s.view_count} ${s.view_count === 1 ? 'view' : 'views'}`,
                        s.expires_at ? `expires ${s.expires_at.slice(0, 10)}` : 'no expiry',
                      ].join(' · ')}
                    </span>
                  </div>
                  {!s.revoked && (
                    <div className="sharetools">
                      <button disabled={busy} onClick={() => void copy(s)}>
                        {copiedId === s.id ? 'Copied' : 'Copy'}
                      </button>
                      <button className="danger" disabled={busy} onClick={() => void revoke(s)}>
                        Revoke
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {live.length > 1 && (
            <p className="help">
              {live.length} links are active. Each is separate — revoking one leaves the
              others working.
            </p>
          )}

          <div className="actions">
            <button className="primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
