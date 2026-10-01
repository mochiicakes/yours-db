import { useState } from 'react'
import type { Sheet, SheetDraft } from '../db'
import { ACCENTS } from '../theme'
import { Modal } from './Modal'

export function SheetEditor({
  editing,
  busy,
  onClose,
  onSave,
  onDelete,
}: {
  editing: Sheet | null
  busy: boolean
  onClose: () => void
  onSave: (draft: SheetDraft) => Promise<boolean>
  onDelete: (() => Promise<boolean>) | null
}) {
  const [draft, setDraft] = useState<SheetDraft>({
    name: editing?.name ?? '',
    description: editing?.description ?? '',
    accent: editing?.accent ?? ACCENTS[0],
    done_label: editing?.done_label ?? 'Done',
  })
  const [problem, setProblem] = useState<string | null>(null)

  async function save() {
    if (!draft.name.trim()) {
      setProblem('A sheet needs a name.')
      return
    }
    if (await onSave(draft)) onClose()
  }

  return (
    <Modal title={editing ? `Settings — ${editing.name}` : 'New sheet'} onClose={onClose}>
      {problem && <div className="alert">{problem}</div>}

      <div className="field">
        <label>Name</label>
        <input
          type="text"
          autoFocus
          placeholder="Reading list"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
      </div>

      <div className="field">
        <label>Description</label>
        <input
          type="text"
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        />
      </div>

      <div className="field">
        <label>
          Checkbox column means
          <span className="typehint">what ticking a row records</span>
        </label>
        <input
          type="text"
          placeholder="Done"
          value={draft.done_label}
          onChange={(e) => setDraft({ ...draft, done_label: e.target.value })}
        />
      </div>

      <div className="field">
        <label>Tab colour</label>
        <div className="swatches">
          {ACCENTS.map((hex) => (
            <button
              key={hex}
              className={`swatch${draft.accent === hex ? ' on' : ''}`}
              style={{ background: hex }}
              aria-label={`Use ${hex}`}
              aria-pressed={draft.accent === hex}
              onClick={() => setDraft({ ...draft, accent: hex })}
            />
          ))}
          <input
            type="color"
            className="colorwell"
            aria-label="Custom tab colour"
            value={draft.accent}
            onChange={(e) => setDraft({ ...draft, accent: e.target.value })}
          />
        </div>
      </div>

      {!editing && (
        <p className="help">
          It starts with one text column called Name. Open <b>Columns</b> afterwards to build the
          rest.
        </p>
      )}

      <div className="actions">
        {onDelete && editing && (
          <button
            className="danger"
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  `Delete "${editing.name}", its columns and every row? This cannot be undone.`,
                )
              ) {
                void onDelete().then((ok) => ok && onClose())
              }
            }}
          >
            Delete sheet
          </button>
        )}
        <button onClick={onClose}>Cancel</button>
        <button className="primary" disabled={busy} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Modal>
  )
}
