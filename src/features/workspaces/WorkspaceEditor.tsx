import { useState } from 'react'
import type { Workspace, WorkspaceDraft } from '../../db'
import { ACCENTS } from '../../theme'
import { Modal } from '../../components/Modal'

export function WorkspaceEditor({
  editing,
  busy,
  onClose,
  onSave,
  onDelete,
}: {
  editing: Workspace | null
  busy: boolean
  onClose: () => void
  onSave: (draft: WorkspaceDraft) => Promise<boolean>
  onDelete: (() => Promise<boolean>) | null
}) {
  const [draft, setDraft] = useState<WorkspaceDraft>({
    name: editing?.name ?? '',
    description: editing?.description ?? '',
    accent: editing?.accent ?? ACCENTS[0],
  })
  const [problem, setProblem] = useState<string | null>(null)

  async function save() {
    if (!draft.name.trim()) {
      setProblem('A workspace needs a name.')
      return
    }
    if (await onSave(draft)) onClose()
  }

  return (
    <Modal title={editing ? `Workspace — ${editing.name}` : 'New workspace'} onClose={onClose}>
      {problem && <div className="alert">{problem}</div>}

      <div className="field">
        <label htmlFor="w_name">Name</label>
        <input
          id="w_name"
          type="text"
          autoFocus
          placeholder="Work"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
      </div>

      <div className="field">
        <label htmlFor="w_desc">Description</label>
        <input
          id="w_desc"
          type="text"
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        />
      </div>

      <div className="field">
        <label>Colour</label>
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
            aria-label="Custom colour"
            value={draft.accent}
            onChange={(e) => setDraft({ ...draft, accent: e.target.value })}
          />
        </div>
      </div>

      <div className="actions">
        {onDelete && editing && (
          <button
            className="danger"
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  `Delete "${editing.name}" and every sheet in it? This cannot be undone.`,
                )
              ) {
                void onDelete().then((ok) => ok && onClose())
              }
            }}
          >
            Delete workspace
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
