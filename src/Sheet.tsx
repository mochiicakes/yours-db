import { useRef, useState } from 'react'
import {
  CHOICE_TYPES,
  cellText,
  choiceSlot,
  isBlank,
  type Cell,
  type Field,
  type Record_,
  type Sheet,
} from './db'
import { choiceColour } from './theme'

// ---------------------------------------------------------------------------
// one cell
// ---------------------------------------------------------------------------

function CellView({ field, value, accent }: { field: Field; value: Cell; accent: string }) {
  if (field.type === 'checkbox') {
    return <span className={value ? 'bool yes' : 'bool no'}>{value ? '✓' : '–'}</span>
  }
  if (isBlank(value)) return <span className="blank">–</span>

  switch (field.type) {
    case 'number':
      return <span className="num">{String(value)}</span>
    case 'date':
      return <span className="date">{String(value)}</span>
    case 'url':
      return (
        <a className="link" href={String(value)} target="_blank" rel="noreferrer">
          {String(value).replace(/^https?:\/\/(www\.)?/, '').slice(0, 36)}
        </a>
      )
    case 'select':
      return (
        <span
          className="pill"
          style={{ background: choiceColour(choiceSlot(String(value), field.options), accent) }}
        >
          {String(value)}
        </span>
      )
    case 'multiselect':
      return (
        <span className="pills">
          {(value as string[]).map((choice) => (
            <span
              key={choice}
              className="pill"
              style={{ background: choiceColour(choiceSlot(choice, field.options), accent) }}
            >
              {choice}
            </span>
          ))}
        </span>
      )
    default:
      return <span>{cellText(value)}</span>
  }
}

// ---------------------------------------------------------------------------
// group action bar
// ---------------------------------------------------------------------------

interface BarProps {
  count: number
  sheet: Sheet
  fields: Field[]
  busy: boolean
  onClear: () => void
  onDone: (done: boolean) => void
  onDuplicate: () => void
  onDelete: () => void
  onSet: (key: string, value: string) => void
}

function GroupBar({
  count,
  sheet,
  fields,
  busy,
  onClear,
  onDone,
  onDuplicate,
  onDelete,
  onSet,
}: BarProps) {
  const [key, setKey] = useState('')
  const [value, setValue] = useState('')

  // Only single-choice columns can be set in bulk. Setting free text across
  // forty rows is nearly always a mistake.
  const settable = fields.filter((f) => f.type === 'select')
  const chosen = settable.find((f) => f.key === key) ?? null

  return (
    <div className="groupbar">
      <strong>{`${count} selected`}</strong>
      <button disabled={busy} onClick={() => onDone(true)}>
        {sheet.done_label}
      </button>
      <button disabled={busy} onClick={() => onDone(false)}>
        {`Un-${sheet.done_label.toLowerCase()}`}
      </button>
      <button disabled={busy} onClick={onDuplicate}>
        Duplicate
      </button>

      {settable.length > 0 && (
        <span className="setgroup">
          <select
            aria-label="Column to set"
            value={key}
            disabled={busy}
            onChange={(e) => {
              setKey(e.target.value)
              setValue('')
            }}
          >
            <option value="">Set column…</option>
            {settable.map((f) => (
              <option key={f.id} value={f.key}>
                {f.name}
              </option>
            ))}
          </select>
          {chosen && (
            <>
              <select
                aria-label={`Value for ${chosen.name}`}
                value={value}
                disabled={busy}
                onChange={(e) => setValue(e.target.value)}
              >
                <option value="">choose…</option>
                {chosen.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
              <button
                disabled={busy || !value}
                onClick={() => {
                  onSet(key, value)
                  setKey('')
                  setValue('')
                }}
              >
                Apply
              </button>
            </>
          )}
        </span>
      )}

      <button className="danger" disabled={busy} onClick={onDelete}>
        {`Delete ${count}`}
      </button>
      <button className="ghost" disabled={busy} onClick={onClear}>
        Clear
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// the sheet
// ---------------------------------------------------------------------------

interface Props {
  sheet: Sheet
  fields: Field[]
  rows: Record_[]
  accent: string
  busy: boolean
  selected: Set<string>
  onSelect: (next: Set<string>) => void
  onToggleDone: (row: Record_) => void
  onEdit: (row: Record_) => void
  onDelete: (row: Record_) => void
  onAdd: () => void
  onColumns: () => void
  onGroupDone: (done: boolean) => void
  onGroupDuplicate: () => void
  onGroupDelete: () => void
  onGroupSet: (key: string, value: string) => void
}

export function SheetView(props: Props) {
  const { sheet, fields, rows, accent, busy, selected } = props
  const anchor = useRef<number | null>(null)

  if (!fields.length) {
    return (
      <div className="hollow">
        <p>This sheet has no columns yet.</p>
        <button className="primary" onClick={props.onColumns}>
          Add a column
        </button>
      </div>
    )
  }

  if (!rows.length) {
    return (
      <div className="hollow">
        <p>No rows yet.</p>
        <button className="primary" onClick={props.onAdd}>
          + Add row
        </button>
      </div>
    )
  }

  const allSelected = rows.every((r) => selected.has(r.id))
  const chosenRows = rows.filter((r) => selected.has(r.id))

  function toggleAll() {
    const next = new Set(selected)
    // Only touches rows currently on screen, so a search plus select-all
    // cannot quietly catch rows you cannot see.
    if (allSelected) rows.forEach((r) => next.delete(r.id))
    else rows.forEach((r) => next.add(r.id))
    props.onSelect(next)
  }

  function toggleRow(index: number, shift: boolean) {
    const next = new Set(selected)
    if (shift && anchor.current !== null) {
      const a = anchor.current
      const [from, to] = a < index ? [a, index] : [index, a]
      const turningOn = !next.has(rows[index].id)
      for (let at = from; at <= to; at += 1) {
        if (turningOn) next.add(rows[at].id)
        else next.delete(rows[at].id)
      }
    } else {
      const id = rows[index].id
      if (next.has(id)) next.delete(id)
      else next.add(id)
      anchor.current = index
    }
    props.onSelect(next)
  }

  return (
    <>
      {chosenRows.length > 0 && (
        <GroupBar
          count={chosenRows.length}
          sheet={sheet}
          fields={fields}
          busy={busy}
          onClear={() => props.onSelect(new Set())}
          onDone={props.onGroupDone}
          onDuplicate={props.onGroupDuplicate}
          onDelete={props.onGroupDelete}
          onSet={props.onGroupSet}
        />
      )}

      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th className="gut">
                <input
                  type="checkbox"
                  checked={allSelected}
                  aria-label={allSelected ? 'Deselect all rows' : 'Select all rows'}
                  onChange={toggleAll}
                />
              </th>
              <th className="donecol" title={sheet.done_label}>
                ✓
              </th>
              {fields.map((f) => (
                <th key={f.id}>
                  {f.name}
                  {f.required && <span className="req">*</span>}
                  {CHOICE_TYPES.includes(f.type) && <span className="tmark">▾</span>}
                </th>
              ))}
              <th className="actcol" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const picked = selected.has(row.id)
              return (
                <tr key={row.id} className={`${row.done ? 'done' : ''}${picked ? ' picked' : ''}`}>
                  {/* The row number doubles as the selection control: it shows
                      the count, and becomes a checkbox on hover or selection. */}
                  <td className="gut">
                    <span className="rownum">{index + 1}</span>
                    <input
                      type="checkbox"
                      checked={picked}
                      aria-label={`Select row ${index + 1}`}
                      onChange={() => undefined}
                      onClick={(e) => toggleRow(index, e.shiftKey)}
                    />
                  </td>
                  <td className="donecol">
                    <input
                      type="checkbox"
                      checked={row.done}
                      aria-label={`${sheet.done_label}: row ${index + 1}`}
                      onChange={() => props.onToggleDone(row)}
                    />
                  </td>
                  {fields.map((f) => (
                    <td key={f.id} className={`c-${f.type}`}>
                      <CellView field={f} value={row.cells[f.key]} accent={accent} />
                    </td>
                  ))}
                  <td className="actcol">
                    <button aria-label={`Edit row ${index + 1}`} onClick={() => props.onEdit(row)}>
                      Edit
                    </button>
                    <button
                      className="ghost"
                      aria-label={`Delete row ${index + 1}`}
                      onClick={() => props.onDelete(row)}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
