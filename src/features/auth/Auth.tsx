import { useState } from 'react'
import { supabase } from '../../db'

export function Auth({ onForgot }: { onForgot?: () => void }) {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function submit() {
    setProblem(null)
    setNotice(null)

    if (!email.trim() || !password) {
      setProblem('Enter an email and a password.')
      return
    }
    if (mode === 'up' && password.length < 8) {
      setProblem('Use at least 8 characters.')
      return
    }

    setBusy(true)
    if (mode === 'up') {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      })
      setBusy(false)
      if (error) {
        setProblem(error.message)
        return
      }
      // With email confirmation on, signUp returns a user but no session.
      if (!data.session) {
        setNotice(`Account created. Check ${email.trim()} for a confirmation link, then sign in.`)
        setMode('in')
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      setBusy(false)
      if (error) setProblem(error.message)
    }
  }

  return (
    <div className="authpage">
      <div className="authcard">
        <h1 className="brand">
          yours<span className="dot">.</span>db
        </h1>
        <p className="tagline">Your data, your words. Organised, personal, comfy to live in.</p>

        <div className="tabs2">
          <button
            className={mode === 'in' ? 'on' : ''}
            onClick={() => {
              setMode('in')
              setProblem(null)
            }}
          >
            Sign in
          </button>
          <button
            className={mode === 'up' ? 'on' : ''}
            onClick={() => {
              setMode('up')
              setProblem(null)
            }}
          >
            Create account
          </button>
        </div>

        {problem && <div className="alert">{problem}</div>}
        {notice && <div className="notice">{notice}</div>}

        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
          />
          {mode === 'up' && <p className="help">At least 8 characters.</p>}
        </div>

        <button className="primary wide" disabled={busy} onClick={() => void submit()}>
          {busy ? 'Working…' : mode === 'up' ? 'Create account' : 'Sign in'}
        </button>

        {mode === 'in' && onForgot && (
          <button className="linklike" onClick={onForgot}>
            Forgot your password?
          </button>
        )}
      </div>
    </div>
  )
}
