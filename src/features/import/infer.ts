// Guesses column types for an imported table and converts cells to the shapes
// validate_cells accepts. Pure: no Supabase, no React.
import { checkCell, toKey, type Cell, type Cells, type Field, type FieldType } from '../../values'
import type { ImportField } from '../../data/types'
import type { RawCell, Table } from './parse'
import { convertCell, rawText, splitChoices, toBoolean, toDate, toNumber, toUrl } from './convert'

export { convertCell, rawText, type Converted } from './convert'

// A column becomes a choice column only if it has few distinct values that repeat.
export const SELECT_MAX_OPTIONS = 12
const SELECT_MIN_ROWS = 4
const SELECT_MAX_LENGTH = 60
// Any longer value (or one with a line break) makes the column long text.
export const LONG_TEXT_AT = 200

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
export function titleIndex(plans: ColumnPlan[]): number {
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
