import { useState } from 'react'
import { ACCENTS, THEMES, type Theme } from '../theme'
import { stripSuffix } from '../Brand'
import { Modal } from './Modal'

export function ThemePicker({
  dbName,
  theme,
  accent,
  onTheme,
  onAccent,
  onRename,
  onClose,
}: {
  dbName: string
  theme: Theme
  accent: string
  onTheme: (t: Theme) => void
  onAccent: (hex: string) => void
  onRename: (name: string) => Promise<boolean>
  onClose: () => void
}) {
  const [name, setName] = useState(dbName)
  const [saving, setSaving] = useState(false)

  async function rename() {
    const trimmed = stripSuffix(name)
    if (!trimmed || trimmed === dbName) return
    setSaving(true)
    await onRename(trimmed)
    setSaving(false)
  }

  return (
    <Modal title="Settings" onClose={onClose}>
      <div className="field">
        <label htmlFor="dbrename">Database name</label>
        <div className="dbinput">
          <input
            id="dbrename"
            type="text"
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void rename()}
          />
          <span className="dbsuffix" aria-hidden="true">
            <span className="dot">.</span>db
          </span>
        </div>
        <div className="listrow" style={{ marginTop: 8 }}>
          <span className="help" style={{ flex: 1, margin: 0 }}>
            Stored with your account, so it follows you between devices.
          </span>
          <button
            disabled={saving || !stripSuffix(name) || stripSuffix(name) === dbName}
            onClick={() => void rename()}
          >
            {saving ? 'Saving…' : 'Rename'}
          </button>
        </div>
      </div>

      <hr className="sep" />

      <p className="help">Theme and accent are remembered on this device and apply immediately.</p>

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
        <label>Accent</label>
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
        <p className="help">
          Choice pills are generated from the accent, so they always suit whatever you pick.
        </p>
      </div>

      <div className="actions">
        <button className="primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  )
}
