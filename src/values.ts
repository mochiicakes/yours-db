/**
 * Field types and the pure value helpers: coercion, validation, display text
 * and column keys. No Supabase import, so this runs in tests without a client.
 */

export const FIELD_TYPES = [
  'text',
  'longtext',
  'number',
  'checkbox',
  'date',
  'select',
  'multiselect',
  'url',
] as const
export type FieldType = (typeof FIELD_TYPES)[number]

export const TYPE_LABEL: Record<FieldType, string> = {
  text: 'Text',
  longtext: 'Long text',
  number: 'Number',
  checkbox: 'Checkbox',
  date: 'Date',
  select: 'Single choice',
  multiselect: 'Multiple choice',
  url: 'Link',
}

/** Types whose values come from a fixed list. */
export const CHOICE_TYPES: FieldType[] = ['select', 'multiselect']

export interface Field {
  id: string
  owner_id: string
  sheet_id: string
  key: string
  name: string
  type: FieldType
  options: string[]
  required: boolean
  is_title: boolean
  position: number
  created_at: string
}

export type Cell = string | number | boolean | string[] | null

export type Cells = Record<string, Cell>

export interface Record_ {
  id: string
  owner_id: string
  sheet_id: string
  cells: Cells
  done: boolean
  position: number
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// value helpers
// ---------------------------------------------------------------------------

export function isBlank(value: Cell): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  return false
}

/** What a brand-new row holds for this column. */
export function blankCell(field: Field): Cell {
  if (field.type === 'checkbox') return false
  if (field.type === 'multiselect') return []
  if (field.type === 'number') return null
  return ''
}

/**
 * Turn whatever a form input produced into the shape the database expects.
 * Inputs always hand back strings, so this is where "42" becomes 42.
 */
export function coerce(field: Field, raw: unknown): Cell {
  switch (field.type) {
    case 'number': {
      if (raw === '' || raw === null || raw === undefined) return null
      const n = typeof raw === 'number' ? raw : Number(String(raw).trim())
      return Number.isFinite(n) ? n : null
    }
    case 'checkbox':
      return Boolean(raw)
    case 'multiselect':
      return Array.isArray(raw) ? raw.map(String) : []
    default:
      return raw === null || raw === undefined ? '' : String(raw)
  }
}

/**
 * Check one cell. Mirrors the validate_cells trigger in the database, so you get
 * a useful message in the form instead of a database error after a round trip.
 * The trigger is still the authority.
 */
export function checkCell(field: Field, value: Cell): string | null {
  if (isBlank(value)) return field.required ? `${field.name} is required.` : null
  switch (field.type) {
    case 'number':
      return typeof value === 'number' ? null : `${field.name} must be a number.`
    case 'checkbox':
      return typeof value === 'boolean' ? null : `${field.name} must be a checkbox.`
    case 'date':
      return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? null
        : `${field.name} must be a date.`
    case 'select':
      return typeof value === 'string' && field.options.includes(value)
        ? null
        : `${field.name} must be one of: ${field.options.join(', ')}.`
    case 'multiselect': {
      if (!Array.isArray(value)) return `${field.name} must be a list.`
      const stray = value.find((v) => !field.options.includes(v))
      return stray ? `${field.name} contains "${stray}", which is not a choice.` : null
    }
    case 'url':
      return typeof value === 'string' && /^https?:\/\//.test(value)
        ? null
        : `${field.name} must start with http:// or https://`
    default:
      return typeof value === 'string' ? null : `${field.name} must be text.`
  }
}

export function checkRow(fields: Field[], cells: Cells): string[] {
  return fields
    .map((f) => checkCell(f, coerce(f, cells[f.key])))
    .filter((m): m is string => m !== null)
}

/** Strip blanks before writing, so "not filled in" is one state, not two. */
export function packCells(fields: Field[], cells: Cells): Cells {
  const out: Cells = {}
  for (const f of fields) {
    const v = coerce(f, cells[f.key])
    if (!isBlank(v)) out[f.key] = v
  }
  return out
}

export function cellText(value: Cell): string {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  return String(value)
}

export function rowTitle(fields: Field[], row: Record_): string {
  const f = fields.find((x) => x.is_title) ?? fields[0]
  const text = f ? cellText(row.cells[f.key]).trim() : ''
  return text || 'Untitled'
}

export function rowSearchText(fields: Field[], row: Record_): string {
  return fields
    .map((f) => cellText(row.cells[f.key]))
    .join(' ')
    .toLowerCase()
}

/** A stable colour index for a choice, by its position in the options list. */
export function choiceSlot(option: string, options: string[]): number {
  const at = options.indexOf(option)
  return at < 0 ? 0 : at % 6
}

/** Column keys must match ^[a-z0-9_]+$ and be unique within their sheet. */
export function toKey(name: string, taken: string[]): string {
  const base =
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'field'
  if (!taken.includes(base)) return base
  let n = 2
  while (taken.includes(`${base}_${n}`)) n += 1
  return `${base}_${n}`
}
