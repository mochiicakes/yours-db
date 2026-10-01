import { useEffect, useState, type ReactNode } from 'react'
import { api, type Profile } from '../../db'
import type { Theme } from '../../theme'
import { Onboarding } from './Onboarding'

// Waits for the profile so the database name is never briefly wrong.
export function Gate({
  email,
  theme,
  accent,
  onTheme,
  onAccent,
  children,
}: {
  email: string
  theme: Theme
  accent: string
  onTheme: (t: Theme) => void
  onAccent: (hex: string) => void
  children: (profile: Profile, rename: (name: string) => Promise<boolean>) => ReactNode
}) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void api
      .loadProfile()
      .then((p) => alive && setProfile(p))
      .catch((e) => alive && setProblem((e as Error).message))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  async function finishOnboarding(name: string) {
    setBusy(true)
    try {
      setProfile(await api.saveProfile(name))
      setProblem(null)
    } catch (e) {
      setProblem((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function renameDatabase(name: string) {
    try {
      setProfile(await api.saveProfile(name))
      return true
    } catch (e) {
      setProblem((e as Error).message)
      return false
    }
  }

  if (loading) return <div className="booting">Loading…</div>

  if (problem && !profile) {
    return (
      <div className="onboard">
        <div className="onboardcard">
          <div className="alert">
            <b>{problem}</b>
            <br />
            If this mentions a missing table, the database migrations have not been applied yet.
          </div>
          <button className="primary wide" onClick={() => window.location.reload()}>
            Try again
          </button>
        </div>
      </div>
    )
  }

  if (!profile?.onboarded) {
    return (
      <Onboarding
        email={email}
        theme={theme}
        accent={accent}
        busy={busy}
        onTheme={onTheme}
        onAccent={onAccent}
        onFinish={(name) => void finishOnboarding(name)}
      />
    )
  }

  return <>{children(profile, renameDatabase)}</>
}
