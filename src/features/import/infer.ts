// Guesses column types for an imported table and converts cells to the shapes
// validate_cells accepts. Pure: no Supabase, no React.
import {
  checkCell,
  isBlank,
  toKey,
  type Cell,
  type Cells,
  type Field,
  type FieldType,
} from '../../values'
import type { ImportField } from '../../data/types'
import type { RawCell, Table } from './parse'

// A column becomes a choice column only if it has few distinct values that repeat.
export const SELECT_MAX_OPTIONS = 12
const SELECT_MIN_ROWS = 4
const SELECT_MAX_LENGTH = 60
// Any longer value (or one with a line break) makes the column long text.
export const LONG_TEXT_AT = 200

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

function toBoolean(value: RawCell): boolean | null {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return null
  const word = value.trim().toLowerCase()
  if (TRUE_WORDS.has(word)) return true
  if (FALSE_WORDS.has(word)) return false
  return null
}

// Accepts 1234, -12.5, "1,234.50", "$12", "€ 3". Leading zeros ("00123") stay
// text so codes and zip codes keep their zeros.
function toNumber(value: RawCell): number | null {
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
function toDate(value: RawCell): string | null {
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
function toUrl(value: RawCell): string | null {
  if (typeof value !== 'string') return null
  const m = /^(https?):\/\/(\S+)$/i.exec(value.trim())
  return m ? `${m[1].toLowerCase()}://${m[2]}` : null
}

function splitChoices(value: RawCell): string[] {
  return rawText(value)
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

// ---------------------------------------------------------------------------
// guessing a type
// ---------------------------------------------------------------------------

export function inferType(values: RawCell[]): FieldType {
  const filled = values.filter((v): v is Exclude<RawCell, null> => v !== null)
  if (filled.length === 0) return 'text'
  if (filled.every((v) => toBoolean(v) !== null)) return 'checkbox'
  if (filled.every((v) => toNumber(v) !== null)) return 'number'
  if (filled.every((v) => toDate(v) !== null)) return 'date'
  if (filled.every((v) => toUrl(v) !== null)) return 'url'

  const texts = filled.map(rawText)
  if (texts.some((t) => t.length > LONG_TEXT_AT || t.includes('\n'))) return 'longtext'

  const distinct = new Set(texts)
  if (
    filled.length >= SELECT_MIN_ROWS &&
    distinct.size <= SELECT_MAX_OPTIONS &&
    distinct.size <= filled.length / 2 &&
    texts.every((t) => t.length <= SELECT_MAX_LENGTH)
  ) {
    return 'select'
  }
  return 'text'
}

// Choices in first-seen order. Multiple choice cells are split on , and ;.
export function choiceOptions(type: FieldType, values: RawCell[]): string[] {
  const seen = new Set<string>()
  for (const v of values) {
    if (v === null) continue
    const parts = type === 'multiselect' ? splitChoices(v) : [rawText(v).trim()]
    for (const p of parts) if (p) seen.add(p)
  }
  return [...seen]
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

// ---------------------------------------------------------------------------
// one column, as the preview needs it
// ---------------------------------------------------------------------------

export interface ColumnProblem {
  count: number
  // First bad cell: 1-based row within the data (the header row is not counted).
  row: number
  message: string
}

export interface ColumnResult {
  options: string[]
  cells: (Cell | null)[]
  problem: ColumnProblem | null
}

function fieldFor(name: string, type: FieldType, options: string[]): Field {
  return {
    id: '',
    owner_id: '',
    sheet_id: '',
    key: 'k',
    name,
    type,
    options,
    required: false,
    is_title: false,
    position: 0,
    created_at: '',
  }
}

// Converts one column. Re-run only the column whose type changed.
export function convertColumn(name: string, type: FieldType, values: RawCell[]): ColumnResult {
  const choice = type === 'select' || type === 'multiselect'
  const options = choice ? choiceOptions(type, values) : []
  if (choice && options.length === 0) {
    return {
      options,
      cells: values.map(() => null),
      problem: { count: 1, row: 1, message: 'has no values to use as choices' },
    }
  }

  // checkCell mirrors the validate_cells trigger, so a clean column will not be rejected.
  const field = fieldFor(name, type, options)
  const cells: (Cell | null)[] = []
  let problem: ColumnProblem | null = null
  values.forEach((raw, i) => {
    const converted = convertCell(type, raw)
    const message = converted.ok
      ? converted.value === null
        ? null
        : checkCell(field, converted.value)
      : converted.message
    if (message) {
      problem = problem
        ? { ...problem, count: problem.count + 1 }
        : { count: 1, row: i + 1, message }
      cells.push(null)
    } else {
      cells.push(converted.ok ? converted.value : null)
    }
  })
  return { options, cells, problem }
}

// ---------------------------------------------------------------------------
// the whole import
// ---------------------------------------------------------------------------

export interface ColumnPlan {
  name: string
  type: FieldType
  include: boolean
}

// Type-only, so this pure module still never loads the Supabase client.
export type { ImportField }

export interface BuiltImport {
  fields: ImportField[]
  rows: Cells[]
  // Indexed like the table's columns; null where the column is fine or left out.
  problems: (ColumnProblem | null)[]
}

export function columnValues(table: Table, index: number): RawCell[] {
  return table.rows.map((r) => r[index] ?? null)
}

// Default plan: header names and guessed types, every column included.
export function planColumns(table: Table): ColumnPlan[] {
  return table.headers.map((name, i) => ({
    name,
    type: inferType(columnValues(table, i)),
    include: true,
  }))
}

// The first included text column is the title; otherwise the first included column.
function titleIndex(plans: ColumnPlan[]): number {
  const text = plans.findIndex((p) => p.include && p.type === 'text')
  return text >= 0 ? text : plans.findIndex((p) => p.include)
}

export function buildImport(
  table: Table,
  plans: ColumnPlan[],
  // Pass results already computed by the preview to skip converting again.
  converted: (ColumnResult | undefined)[] = [],
): BuiltImport {
  const title = titleIndex(plans)
  const taken: string[] = []
  const fields: ImportField[] = []
  const columns: { key: string; cells: (Cell | null)[] }[] = []
  const problems: (ColumnProblem | null)[] = plans.map(() => null)

  plans.forEach((plan, i) => {
    if (!plan.include) return
    const name = plan.name.trim() || `Column ${i + 1}`
    const result = converted[i] ?? convertColumn(name, plan.type, columnValues(table, i))
    const key = toKey(name, taken)
    taken.push(key)
    fields.push({ key, name, type: plan.type, options: result.options, is_title: i === title })
    columns.push({ key, cells: result.cells })
    problems[i] = result.problem
  })

  const rows: Cells[] = []
  table.rows.forEach((_, r) => {
    const cells: Cells = {}
    for (const c of columns) {
      const v = c.cells[r]
      if (v !== null && v !== undefined) cells[c.key] = v
    }
    // A row whose kept columns are all blank is not worth importing.
    if (Object.keys(cells).length > 0) rows.push(cells)
  })

  return { fields, rows, problems }
}
