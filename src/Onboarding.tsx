import { useState } from 'react'
import { ACCENTS, THEMES, type Theme } from './theme'
import { Brand, stripSuffix } from './Brand'

/**
 * Shown once, the first time an account signs in.
 *
 * It asks one question. The `.db` sits fixed beside the input rather than
 * inside it, so the suffix is visibly not yours to type — and the full stop
 * takes the accent colour, so changing the accent below repaints it live.
 * That period is the one piece of the identity carried through every screen,
 * which is why it is worth seeing before anything is committed.
 */

const SUGGESTIONS = ['second brain', 'life', 'studio', 'cabinet', 'archive']

export function Onboarding({
  email,
  theme,
  accent,
  busy,
  onTheme,
  onAccent,
  onFinish,
}: {
  email: string
  theme: Theme
  accent: string
  busy: boolean
  onTheme: (t: Theme) => void
  onAccent: (hex: string) => void
  onFinish: (name: string) => void
}) {
  const [name, setName] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  function finish() {
    // If they typed the suffix themselves, drop it rather than storing
    // something that would render as "brain.db.db".
    const clean = stripSuffix(name)
    if (!clean) {
      setProblem('Give it a name — you can change it later.')
      return
    }
    if (clean.length > 60) {
      setProblem('Keep it under 60 characters.')
      return
    }
    onFinish(clean)
  }

  return (
    <div className="onboard">
      <div className="onboardcard">
        <p className="eyebrow">{email}</p>
        <h1>It&rsquo;s yours, name your db.</h1>
        <p className="lede">
          This sits at the top of every screen. Pick something that sounds like you —
          it is easy to change later.
        </p>

        {problem && <div className="alert">{problem}</div>}

        <div className="field">
          <div className="dbinput">
            <input
              id="dbname"
              type="text"
              autoFocus
              maxLength={60}
              placeholder="second brain"
              aria-label="Database name"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setProblem(null)
              }}
              onKeyDown={(e) => e.key === 'Enter' && finish()}
            />
            <span className="dbsuffix" aria-hidden="true">
              <span className="dot">.</span>db
            </span>
          </div>
          <div className="suggestions">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                className={`suggestion${name === s ? ' on' : ''}`}
                onClick={() => {
                  setName(s)
                  setProblem(null)
                }}
              >
                {s}
                <span className="dot">.</span>db
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Theme</label>
          <div className="themegrid">
            {THEMES.map((t) => (
              <button
                key={t.id}
                className={`themecard${t.id === theme.id ? ' on' : ''}`}
                aria-pressed={t.id === theme.id}
                onClick={() => onTheme(t)}
                style={{
                  background: t.vars['--panel'],
                  borderColor: t.id === theme.id ? accent : t.vars['--line'],
                  color: t.vars['--text'],
                }}
              >
                <span className="themedot" style={{ background: accent }} />
                {t.name}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Accent — the colour of your full stop</label>
          <div className="swatches">
            {ACCENTS.map((hex) => (
              <button
                key={hex}
                className={`swatch${accent === hex ? ' on' : ''}`}
                style={{ background: hex }}
                aria-label={`Accent ${hex}`}
                aria-pressed={accent === hex}
                onClick={() => onAccent(hex)}
              />
            ))}
            <input
              type="color"
              className="colorwell"
              aria-label="Custom accent colour"
              value={accent}
              onChange={(e) => onAccent(e.target.value)}
            />
          </div>
        </div>

        <div className="preview" aria-hidden="true">
          <span className="previewlabel">Preview</span>
          <Brand name={stripSuffix(name) || 'second brain'} className="previewbrand" />
        </div>

        <button className="primary wide" disabled={busy} onClick={finish}>
          {busy ? 'Setting up…' : 'Start building'}
        </button>
      </div>
    </div>
  )
}
