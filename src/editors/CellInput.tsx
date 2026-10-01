import { choiceSlot, coerce, type Cell, type Field } from '../db'
import { choiceColour } from '../theme'

export function CellInput({
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
