import { useId } from 'react'
import { cellText, FIELD_TYPES, TYPE_LABEL, type FieldType } from '../../values'
import { setColumn, type TabDraft } from './drafts'
import { rawText, titleIndex } from './infer'

const SAMPLE_ROWS = 5

// One tab's columns: include, rename and retype each, with the first rows as they will import.
export function ColumnPreview({
  draft,
  disabled,
  onChange,
}: {
  draft: TabDraft
  disabled: boolean
  onChange: (next: TabDraft) => void
}) {
  const nameId = useId()
  const { table, plans, results } = draft
  if (!table || !plans || !results) return null
  const title = titleIndex(plans)
  const sample = table.rows.slice(0, SAMPLE_ROWS)

  return (
    <>
      <div className="field">
        <label htmlFor={nameId}>Sheet name</label>
        <input
          id={nameId}
          value={draft.name}
          disabled={disabled}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
        />
      </div>

      <div className="impscroll">
        <table className="imptable">
          <thead>
            <tr>
              {plans.map((p, i) => {
                const problem = p.include ? results[i].problem : null
                const header = table.headers[i]
                return (
                  <th key={i} className={p.include ? undefined : 'off'}>
                    <label className="check impinclude">
                      <input
                        type="checkbox"
                        checked={p.include}
                        disabled={disabled}
                        onChange={(e) =>
                          onChange(setColumn(draft, i, { include: e.target.checked }))
                        }
                      />
                      {i === title ? 'Include · title' : 'Include'}
                    </label>
                    <input
                      aria-label={`Name for column ${header}`}
                      value={p.name}
                      disabled={disabled || !p.include}
                      onChange={(e) => onChange(setColumn(draft, i, { name: e.target.value }))}
                    />
                    <select
                      aria-label={`Type for column ${header}`}
                      value={p.type}
                      disabled={disabled || !p.include}
                      onChange={(e) =>
                        onChange(setColumn(draft, i, { type: e.target.value as FieldType }))
                      }
                    >
                      {FIELD_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {TYPE_LABEL[t]}
                        </option>
                      ))}
                    </select>
                    {problem && (
                      <div className="impproblem" role="alert">
                        {`${problem.count.toLocaleString()} ${problem.count === 1 ? 'cell does' : 'cells do'} not fit. Row ${problem.row}: ${problem.message.replace(/\.$/, '')}.`}
                        <button
                          className="ghost"
                          disabled={disabled}
                          onClick={() => onChange(setColumn(draft, i, { type: 'text' }))}
                        >
                          Use text
                        </button>
                      </div>
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {sample.map((row, r) => (
              <tr key={r}>
                {plans.map((p, i) => {
                  const value = results[i].cells[r]
                  // A cell that did not convert shows its original text, marked.
                  const bad = p.include && value === null && row[i] !== null
                  return (
                    <td key={i} className={!p.include ? 'off' : bad ? 'bad' : undefined}>
                      {bad ? rawText(row[i]) : cellText(value ?? null)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="help">
        {table.rows.length > SAMPLE_ROWS
          ? `Showing the first ${SAMPLE_ROWS} of ${table.rows.length.toLocaleString()} rows.`
          : `${table.rows.length} ${table.rows.length === 1 ? 'row' : 'rows'}.`}
      </p>
    </>
  )
}
