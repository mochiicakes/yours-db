import { useState } from 'react'
import type { Field, Sheet } from '../../db'

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

export function GroupBar({
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

  // Only single-choice columns can be set in bulk.
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
