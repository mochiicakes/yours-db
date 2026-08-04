import { useCallback, useEffect, useState } from 'react'
import { supabase } from './db'
import { newToken } from './Shared'

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
  onClose,
}: {
  scope: 'sheet' | 'workspace'
  targetId: string
  targetName: string
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

  /** Every link this account owns. RLS already limits it to yours. */
  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('shares')
      .select('*')
      .eq('revoked', false)
      .order('created_at', { ascending: false })
    if (error) setProblem(error.message)
    else {
      setShares((data ?? []) as Share[])
      setProblem(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function linkFor(token: string): string {
    return `${window.location.origin}/?s=${token}`
  }

  /** True when this link points at whatever the modal was opened from. */
  function isThisTarget(s: Share): boolean {
    return s.scope === scope && (scope === 'sheet' ? s.sheet_id : s.workspace_id) === targetId
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
      // The clipboard API is unavailable on plain http:// origins other than
      // localhost, so this is a normal thing to hit, not an edge case.
      setProblem('Could not reach the clipboard. Click the link box, then press Ctrl+C.')
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
    // Drop it from the list rather than showing a dead entry. The row stays in
    // the database, so the view count is still there if you ever need it.
    setShares((prev) => prev.filter((s) => s.id !== share.id))
  }

  // `shares` already holds only live links; revoked ones are never fetched.
  const live = shares

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wide" role="dialog" aria-modal="true">
        <div className="modalhead">
          <h2>Sharing {targetName}</h2>
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

          <div className="listrow sharehead">
            <span className="sublabel">
              {loading ? 'Loading links…' : `Active links (${shares.length})`}
            </span>
            <button disabled={busy || loading} onClick={() => void load()}>
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="hollow">Loading…</div>
          ) : !shares.length ? (
            <div className="hollow">
              No active links. Create one above and it will appear here.
            </div>
          ) : (
            <ul className="sharelist">
              {shares.map((s) => (
                <li
                  key={s.id}
                  className={`shareitem${isThisTarget(s) ? ' current' : ''}`}
                >
                  <div className="sharemain">
                    {/*
                      A real input rather than styled text: it stays selectable
                      so the link can be copied by hand when the clipboard API
                      is unavailable.
                    */}
                    <input
                      className="sharelink"
                      type="text"
                      readOnly
                      value={linkFor(s.token)}
                      aria-label={`Share link for ${s.label || 'untitled'}`}
                      onFocus={(e) => e.currentTarget.select()}
                      onClick={(e) => e.currentTarget.select()}
                    />
                    <span className="sharemeta">
                      {[
                        `${s.label || 'untitled'} · ${
                          s.scope === 'workspace' ? 'whole workspace' : 'single sheet'
                        }`,
                        `${s.view_count} ${s.view_count === 1 ? 'view' : 'views'}`,
                        s.last_seen_at ? `last opened ${s.last_seen_at.slice(0, 10)}` : 'never opened',
                        s.expires_at ? `expires ${s.expires_at.slice(0, 10)}` : 'no expiry',
                      ].join(' · ')}
                    </span>
                  </div>
                  <div className="sharetools">
                    <button disabled={busy} onClick={() => void copy(s)}>
                      {copiedId === s.id ? 'Copied' : 'Copy'}
                    </button>
                    <button className="danger" disabled={busy} onClick={() => void revoke(s)}>
                      Revoke
                    </button>
                  </div>
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
