import { useEffect, useState } from 'react'
import {
  CHOICE_TYPES,
  FIELD_TYPES,
  TYPE_LABEL,
  blankCell,
  checkRow,
  choiceSlot,
  coerce,
  toKey,
  type Cell,
  type Cells,
  type Field,
  type FieldDraft,
  type FieldType,
  type Record_,
  type Sheet,
  type SheetDraft,
} from './db'
import { ACCENTS, THEMES, choiceColour, type Theme } from './theme'
import { Brand, stripSuffix } from './Brand'
import type { WorkspaceDraft, Workspace } from './db'

// ---------------------------------------------------------------------------
// shell
// ---------------------------------------------------------------------------

export function Modal({
  title,
  wide,
  onClose,
  children,
}: {
  title: string
  wide?: boolean
  onClose: () => void
  children: React.ReactNode
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="overlay">
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modalhead">
          <h2>{title}</h2>
          <button className="ghost" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modalbody">{children}</div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// one typed input
// ---------------------------------------------------------------------------

function Input({
  field,
  value,
  accent,
  onChange,
  autoFocus,
}: {
  field: Field
  value: Cell
  accent: string
  onChange: (v: Cell) => void
  autoFocus?: boolean
}) {
  switch (field.type) {
    case 'longtext':
      return (
        <textarea
          autoFocus={autoFocus}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    case 'number':
      return (
        <input
          type="number"
          autoFocus={autoFocus}
          value={value === null || value === undefined ? '' : String(value)}
          onChange={(e) => onChange(coerce(field, e.target.value))}
        />
      )
    case 'checkbox':
      return (
        <label className="check">
          <input
            type="checkbox"
            autoFocus={autoFocus}
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span>Yes</span>
        </label>
      )
    case 'date':
      return (
        <input
          type="date"
          autoFocus={autoFocus}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    case 'select':
      return (
        <select
          autoFocus={autoFocus}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">— none —</option>
          {field.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )
    case 'multiselect': {
      const chosen = Array.isArray(value) ? value : []
      return (
        <div className="pillpick">
          {field.options.map((o) => {
            const on = chosen.includes(o)
            return (
              <button
                key={o}
                type="button"
                className={`pill pick${on ? ' on' : ''}`}
                style={
                  on
                    ? { background: choiceColour(choiceSlot(o, field.options), accent) }
                    : undefined
                }
                aria-pressed={on}
                onClick={() => onChange(on ? chosen.filter((c) => c !== o) : [...chosen, o])}
              >
                {o}
              </button>
            )
          })}
        </div>
      )
    }
    case 'url':
      return (
        <input
          type="url"
          inputMode="url"
          placeholder="https://"
          autoFocus={autoFocus}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    default:
      return (
        <input
          type="text"
          autoFocus={autoFocus}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        />
      )
  }
}

// ---------------------------------------------------------------------------
// add / edit a row
// ---------------------------------------------------------------------------

export function RowEditor({
  fields,
  editing,
  accent,
  busy,
  onClose,
  onSave,
}: {
  fields: Field[]
  editing: Record_ | null
  accent: string
  busy: boolean
  onClose: () => void
  onSave: (cells: Cells) => Promise<boolean>
}) {
  const [cells, setCells] = useState<Cells>({})
  const [problems, setProblems] = useState<string[]>([])

  useEffect(() => {
    // Start from a blank row so a column added after this row was created still
    // gets an input, then lay any stored values over the top.
    const base: Cells = {}
    for (const f of fields) base[f.key] = blankCell(f)
    if (editing) {
      for (const f of fields) {
        if (f.key in editing.cells) base[f.key] = editing.cells[f.key]
      }
    }
    setCells(base)
    setProblems([])
  }, [editing, fields])

  async function save() {
    const found = checkRow(fields, cells)
    if (found.length) {
      setProblems(found)
      return
    }
    if (await onSave(cells)) onClose()
  }

  return (
    <Modal title={editing ? 'Edit row' : 'New row'} onClose={onClose}>
      {problems.length > 0 && (
        <div className="alert">
          {problems.map((p) => (
            <div key={p}>{p}</div>
          ))}
        </div>
      )}

      {fields.map((f, i) => (
        <div className="field" key={f.id}>
          <label>
            {f.name}
            {f.required && <span className="req"> *</span>}
            <span className="typehint">{TYPE_LABEL[f.type]}</span>
          </label>
          <Input
            field={f}
            value={cells[f.key]}
            accent={accent}
            autoFocus={i === 0}
            onChange={(v) => setCells((prev) => ({ ...prev, [f.key]: v }))}
          />
        </div>
      ))}

      <div className="actions">
        <button onClick={onClose}>Cancel</button>
        <button className="primary" disabled={busy} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// columns
// ---------------------------------------------------------------------------

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
      key: draft.key || toKey(draft.name, fields.map((f) => f.key)),
    }
    const ok = adding ? await onAdd(ready) : openId ? await onEdit(openId, ready) : false
    if (ok) cancel()
  }

  const original = openId ? fields.find((f) => f.id === openId) ?? null : null
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
          holding values that no longer fit will refuse to save until you fix them. Nothing
          is deleted.
        </div>
      )}

      {/* "Required" means "has a value", and a checkbox always has one, so the
          option would do nothing here. */}
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
        The ★ column is what a row is called elsewhere in the app. Deleting a column
        removes its data from every row.
      </p>

      {problem && <div className="alert">{problem}</div>}

      <div className="collist">
        {fields.map((f, i) => (
          <div className="colitem" key={f.id}>
            <div className="colhead">
              <button className="colname" onClick={() => (openId === f.id ? cancel() : startEdit(f))}>
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

// ---------------------------------------------------------------------------
// sheet settings
// ---------------------------------------------------------------------------

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
          It starts with one text column called Name. Open <b>Columns</b> afterwards to build
          the rest.
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

// ---------------------------------------------------------------------------
// appearance
// ---------------------------------------------------------------------------

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

      <p className="help">
        Theme and accent are remembered on this device and apply immediately.
      </p>

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


// ---------------------------------------------------------------------------
// workspace settings
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// profile
// ---------------------------------------------------------------------------

export function ProfileModal({
  email,
  dbName,
  since,
  workspaces,
  sheets,
  rows,
  onClose,
}: {
  email: string
  dbName: string
  since: string
  workspaces: number
  sheets: number
  rows: number
  onClose: () => void
}) {
  return (
    <Modal title="Profile" onClose={onClose}>
      <div className="profilehead">
        <span className="avatar big">{(email.trim()[0] ?? '?').toUpperCase()}</span>
        <div>
          <Brand name={dbName} className="profilebrand" />
          <p className="help" style={{ margin: 0 }}>{email}</p>
        </div>
      </div>

      <dl className="statlist">
        <div>
          <dt>Workspaces</dt>
          <dd>{workspaces}</dd>
        </div>
        <div>
          <dt>Sheets</dt>
          <dd>{sheets}</dd>
        </div>
        <div>
          <dt>Rows</dt>
          <dd>{rows}</dd>
        </div>
        <div>
          <dt>Member since</dt>
          <dd>{since ? since.slice(0, 10) : '—'}</dd>
        </div>
      </dl>

      <p className="help">
        Your email and password are handled by Supabase Auth. To change either, sign
        out and use the password reset flow.
      </p>

      <div className="actions">
        <button className="primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// support
// ---------------------------------------------------------------------------

export function SupportModal({
  email,
  onClose,
}: {
  email: string
  onClose: () => void
}) {
  const address = 'mochii.support@gmail.com'
  const subject = encodeURIComponent('mochii.db — help')
  const body = encodeURIComponent(
    `\n\n---\nAccount: ${email}\nBrowser: ${
      typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent
    }`,
  )

  return (
    <Modal title="Contact support" onClose={onClose}>
      <p className="help">
        Tell us what happened and what you expected instead. If something failed,
        the exact error text is the most useful thing you can send.
      </p>

      <div className="field">
        <label>Email</label>
        <div className="listrow">
          <input type="text" readOnly value={address} />
          <button
            onClick={() => {
              void navigator.clipboard?.writeText(address)
            }}
          >
            Copy
          </button>
        </div>
      </div>

      <a className="btnlink" href={`mailto:${address}?subject=${subject}&body=${body}`}>
        Open in your mail app
      </a>

      <p className="help">
        Change this address in <code>src/Editors.tsx</code> — it is a placeholder.
      </p>

      <div className="actions">
        <button onClick={onClose}>Close</button>
      </div>
    </Modal>
  )
}
