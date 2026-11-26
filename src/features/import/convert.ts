// Reads raw spreadsheet values and converts them to the shapes validate_cells
// accepts. Pure: no Supabase, no React.
import { isBlank, type Cell, type FieldType } from '../../values'
import type { RawCell } from './parse'

const TRUE_WORDS = new Set(['true', 'yes', 'y'])
const FALSE_WORDS = new Set(['false', 'no', 'n'])

// ---------------------------------------------------------------------------
// reading raw values
// ---------------------------------------------------------------------------

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

// .xlsx dates arrive as UTC instants; a date-only cell is midnight UTC.
function dateText(d: Date): string {
  const day = d.toISOString().slice(0, 10)
  const hasTime = d.getUTCHours() || d.getUTCMinutes() || d.getUTCSeconds()
  return hasTime ? `${day} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` : day
}

export function rawText(value: RawCell): string {
  if (value === null) return ''
  if (value instanceof Date) return dateText(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return String(value)
}

export function toBoolean(value: RawCell): boolean | null {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return null
  const word = value.trim().toLowerCase()
  if (TRUE_WORDS.has(word)) return true
  if (FALSE_WORDS.has(word)) return false
  return null
}

// Accepts 1234, -12.5, "1,234.50", "$12", "€ 3". Leading zeros ("00123") stay
// text so codes and zip codes keep their zeros.
export function toNumber(value: RawCell): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const s = value.trim().replace(/^([-+]?)\s*[$€£¥]\s*/, '$1')
  const plain = /^[-+]?(0|[1-9]\d*)(\.\d+)?$/.test(s) || /^[-+]?0?\.\d+$/.test(s)
  const grouped = /^[-+]?[1-9]\d{0,2}(,\d{3})+(\.\d+)?$/.test(s)
  if (!plain && !grouped) return null
  const n = Number(s.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

// Only unambiguous forms: real spreadsheet dates and ISO text. "03/04/2026"
// could be March or April, so it stays text.
export function toDate(value: RawCell): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value !== 'string') return null
  const m =
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.exec(
      value.trim(),
    )
  if (!m) return null
  const [, y, mo, d] = m
  const check = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)))
  return check.getUTCMonth() === Number(mo) - 1 && check.getUTCDate() === Number(d)
    ? `${y}-${mo}-${d}`
    : null
}

// The database checks a case-sensitive ^https?:// prefix, so the scheme is lower-cased.
export function toUrl(value: RawCell): string | null {
  if (typeof value !== 'string') return null
  const m = /^(https?):\/\/(\S+)$/i.exec(value.trim())
  return m ? `${m[1].toLowerCase()}://${m[2]}` : null
}

export function splitChoices(value: RawCell): string[] {
  return rawText(value)
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

// ---------------------------------------------------------------------------
// converting cells
// ---------------------------------------------------------------------------

export type Converted = { ok: true; value: Cell } | { ok: false; message: string }

const TYPE_HINT: Partial<Record<FieldType, string>> = {
  number: 'is not a number',
  checkbox: 'is not yes/no or true/false',
  date: 'is not a date written as YYYY-MM-DD',
  url: 'does not start with http:// or https://',
}

// A blank cell converts to null, which means "leave it out of the row".
export function convertCell(type: FieldType, raw: RawCell): Converted {
  if (raw === null) return { ok: true, value: null }
  let value: Cell | null
  switch (type) {
    case 'number':
      value = toNumber(raw)
      break
    case 'checkbox':
      value = toBoolean(raw)
      break
    case 'date':
      value = toDate(raw)
      break
    case 'url':
      value = toUrl(raw)
      break
    case 'select':
      value = rawText(raw).trim()
      break
    case 'multiselect':
      value = splitChoices(raw)
      break
    default:
      value = rawText(raw)
  }
  if (value === null) return { ok: false, message: `"${rawText(raw)}" ${TYPE_HINT[type]}` }
  return { ok: true, value: isBlank(value) ? null : value }
}
