import { useEffect, useState } from 'react'
import { TYPE_LABEL, blankCell, checkRow, type Cells, type Field, type Record_ } from '../../db'
import { Modal } from '../../components/Modal'
import { CellInput } from './CellInput'

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
    // Start from a blank row so columns added later still get an input.
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
          <CellInput
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
