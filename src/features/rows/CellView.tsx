import { cellText, choiceSlot, isBlank, type Cell, type Field } from '../../db'
import { choiceColour } from '../../theme'

export function CellView({ field, value, accent }: { field: Field; value: Cell; accent: string }) {
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
          {String(value)
            .replace(/^https?:\/\/(www\.)?/, '')
            .slice(0, 36)}
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
