import { useState } from 'react'
import {
  CHOICE_TYPES,
  FIELD_TYPES,
  TYPE_LABEL,
  toKey,
  type Field,
  type FieldDraft,
  type FieldType,
} from '../../db'
import { Modal } from '../../components/Modal'

export function ColumnManager({
  sheetName,
  fields,
  busy,
  onClose,
  onAdd,
  onEdit,
  onDelete,
  onMove,
  onMakeTitle,
}: {
  sheetName: string
  fields: Field[]
  busy: boolean
  onClose: () => void
  onAdd: (draft: FieldDraft) => Promise<boolean>
  onEdit: (id: string, draft: FieldDraft) => Promise<boolean>
  onDelete: (id: string) => Promise<boolean>
  onMove: (index: number, by: -1 | 1) => void
  onMakeTitle: (id: string) => void
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<FieldDraft | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  function startAdd() {
    setProblem(null)
    setOpenId(null)
    setAdding(true)
    setDraft({ key: '', name: '', type: 'text', options: [], required: false })
  }

  function startEdit(f: Field) {
    setProblem(null)
    setAdding(false)
    setOpenId(f.id)
    setDraft({
      key: f.key,
      name: f.name,
      type: f.type,
      options: [...f.options],
      required: f.required,
    })
  }

  function cancel() {
    setAdding(false)
    setOpenId(null)
    setDraft(null)
    setProblem(null)
  }

  async function save() {
    if (!draft) return
    if (!draft.name.trim()) {
      setProblem('A column needs a name.')
      return
    }
    const options = draft.options.map((o) => o.trim()).filter(Boolean)
    if (CHOICE_TYPES.includes(draft.type) && !options.length) {
      setProblem('A choice column needs at least one option.')
      return
    }
    const ready: FieldDraft = {
      ...draft,
      options,
      key:
        draft.key ||
        toKey(
          draft.name,
          fields.map((f) => f.key),
        ),
    }
    const ok = adding ? await onAdd(ready) : openId ? await onEdit(openId, ready) : false
    if (ok) cancel()
  }

  const original = openId ? (fields.find((f) => f.id === openId) ?? null) : null
  const typeChanged = original !== null && draft !== null && original.type !== draft.type

  const form = draft && (
    <div className="colform">
      <div className="row2">
        <div className="field">
          <label>Name</label>
          <input
            type="text"
            autoFocus
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Type</label>
          <select
            value={draft.type}
            onChange={(e) => setDraft({ ...draft, type: e.target.value as FieldType })}
          >
            {FIELD_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
      </div>
      {typeChanged && original && (
        <div className="notice">
          Changing <b>{TYPE_LABEL[original.type]}</b> → <b>{TYPE_LABEL[draft.type]}</b>. Rows
          holding values that no longer fit will refuse to save until you fix them. Nothing is
          deleted.
        </div>
      )}
      {/* A checkbox always has a value, so Required would do nothing. */}
      {draft.type !== 'checkbox' && (
        <label className="check">
          <input
            type="checkbox"
            checked={draft.required}
            onChange={(e) => setDraft({ ...draft, required: e.target.checked })}
          />
          <span>Required</span>
        </label>
      )}
      {CHOICE_TYPES.includes(draft.type) && (
        <>
          <p className="sublabel">Options</p>
          {draft.options.map((o, i) => (
            <div className="listrow" key={i}>
              <input
                type="text"
                value={o}
                aria-label={`Option ${i + 1}`}
                onChange={(e) => {
                  const next = [...draft.options]
                  next[i] = e.target.value
                  setDraft({ ...draft, options: next })
                }}
              />
              <button
                className="ghost"
                aria-label={`Remove option ${i + 1}`}
                onClick={() =>
                  setDraft({ ...draft, options: draft.options.filter((_, at) => at !== i) })
                }
              >
                ✕
              </button>
            </div>
          ))}
          <button
            className="dashed"
            onClick={() => setDraft({ ...draft, options: [...draft.options, ''] })}
          >
            + Add option
          </button>
        </>
      )}
      <div className="actions">
        <button onClick={cancel}>Cancel</button>
        <button className="primary" disabled={busy} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save column'}
        </button>
      </div>
    </div>
  )

  return (
    <Modal title={`Columns — ${sheetName}`} wide onClose={onClose}>
      <p className="help">
        The ★ column is what a row is called elsewhere in the app. Deleting a column removes its
        data from every row.
      </p>

      {problem && <div className="alert">{problem}</div>}

      <div className="collist">
        {fields.map((f, i) => (
          <div className="colitem" key={f.id}>
            <div className="colhead">
              <button
                className="colname"
                onClick={() => (openId === f.id ? cancel() : startEdit(f))}
              >
                {f.is_title && <span className="star">★</span>}
                <span>{f.name}</span>
                <span className="typehint">{TYPE_LABEL[f.type]}</span>
                {f.required && <span className="req">*</span>}
              </button>
              <div className="coltools">
                <button
                  className="ghost"
                  disabled={busy || i === 0}
                  aria-label={`Move ${f.name} up`}
                  onClick={() => onMove(i, -1)}
                >
                  ↑
                </button>
                <button
                  className="ghost"
                  disabled={busy || i === fields.length - 1}
                  aria-label={`Move ${f.name} down`}
                  onClick={() => onMove(i, 1)}
                >
                  ↓
                </button>
                {!f.is_title && (
                  <button
                    className="ghost"
                    disabled={busy}
                    title="Use as the row title"
                    aria-label={`Make ${f.name} the title column`}
                    onClick={() => onMakeTitle(f.id)}
                  >
                    ☆
                  </button>
                )}
                <button
                  className="ghost"
                  disabled={busy || fields.length === 1}
                  title={fields.length === 1 ? 'A sheet needs one column' : `Delete ${f.name}`}
                  aria-label={`Delete ${f.name}`}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Delete "${f.name}"? Its data is removed from every row. This cannot be undone.`,
                      )
                    ) {
                      void onDelete(f.id).then((ok) => ok && openId === f.id && cancel())
                    }
                  }}
                >
                  ✕
                </button>
              </div>
            </div>
            {openId === f.id && form}
          </div>
        ))}
      </div>

      {adding ? (
        <div className="colitem open">{form}</div>
      ) : (
        <button className="dashed" disabled={busy} onClick={startAdd}>
          + Add column
        </button>
      )}

      <div className="actions">
        <button className="primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  )
}
