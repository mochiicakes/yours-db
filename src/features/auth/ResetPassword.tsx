import { useState } from 'react'
import { supabase } from '../../db'
import { Brand } from '../../components/Brand'

// ---------------------------------------------------------------------------
// step 1 — ask for the email
// ---------------------------------------------------------------------------

// A recovery link signs you in, so App.tsx shows SetNewPassword on PASSWORD_RECOVERY instead of the app.
export function ForgotPassword({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  async function send() {
    if (!email.trim()) {
      setProblem('Enter the email on your account.')
      return
    }
    setBusy(true)
    setProblem(null)

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      // This URL must also be listed in Supabase under Authentication → URL Configuration → Redirect URLs.
      redirectTo: `${window.location.origin}/`,
    })

    setBusy(false)
    if (error) {
      setProblem(error.message)
      return
    }
    // Same message either way, so nobody can test which emails are registered.
    setSent(true)
  }

  return (
    <div className="authpage">
      <div className="authcard">
        <Brand name="yours" />
        <p className="tagline">Reset your password.</p>

        {problem && <div className="alert">{problem}</div>}

        {sent ? (
          <>
            <div className="notice">
              If an account exists for <b>{email.trim()}</b>, a reset link is on its way. It expires
              in about an hour.
            </div>
            <p className="help">
              Open the link on this device — it signs you in just long enough to set a new password.
              Check spam if it has not arrived in a few minutes.
            </p>
            <button className="wide" onClick={onBack}>
              Back to sign in
            </button>
          </>
        ) : (
          <>
            <div className="field">
              <label htmlFor="reset_email">Email</label>
              <input
                id="reset_email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void send()}
              />
            </div>
            <button className="primary wide" disabled={busy} onClick={() => void send()}>
              {busy ? 'Sending…' : 'Email me a reset link'}
            </button>
            <button className="ghost wide" onClick={onBack}>
              Back to sign in
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// step 2 — the link landed; set the new password
// ---------------------------------------------------------------------------

export function SetNewPassword({
  email,
  onDone,
  onCancel,
}: {
  email: string
  onDone: () => void
  onCancel: () => void
}) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  async function save() {
    if (password.length < 8) {
      setProblem('Use at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setProblem('The two passwords do not match.')
      return
    }
    setBusy(true)
    setProblem(null)

    // Works only because the recovery link established a session.
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) {
      setProblem(error.message)
      return
    }
    onDone()
  }

  return (
    <div className="authpage">
      <div className="authcard">
        <Brand name="yours" />
        <p className="tagline">Choose a new password.</p>
        <p className="eyebrow">{email}</p>

        {problem && <div className="alert">{problem}</div>}

        <div className="field">
          <label htmlFor="new_pw">New password</label>
          <input
            id="new_pw"
            type="password"
            autoComplete="new-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="help">At least 8 characters.</p>
        </div>

        <div className="field">
          <label htmlFor="confirm_pw">Confirm it</label>
          <input
            id="confirm_pw"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void save()}
          />
        </div>

        <button className="primary wide" disabled={busy} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save password'}
        </button>
        <button className="ghost wide" onClick={onCancel}>
          Cancel and sign out
        </button>
      </div>
    </div>
  )
}
