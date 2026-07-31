import { createClient } from '@supabase/supabase-js'

/**
 * Types, the Supabase client, and every database call the app makes.
 *
 * There is no backend server: Supabase exposes the Postgres tables as a REST
 * API and the policies in schema.sql decide what each request may touch. These
 * functions are typed wrappers so components never build queries by hand.
 */

// ---------------------------------------------------------------------------
// client
// ---------------------------------------------------------------------------

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_KEY

if (!url || !key) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_KEY. Copy .env.example to ' +
      '.env.local, fill in both values from Supabase → Settings → API Keys, ' +
      'then restart `npm run dev`.',
  )
}

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

// ---------------------------------------------------------------------------
// types
// ---------------------------------------------------------------------------

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

export interface Profile {
  id: string
  db_name: string
  onboarded: boolean
  created_at: string
}

export interface Workspace {
  id: string
  owner_id: string
  name: string
  description: string
  accent: string
  position: number
  created_at: string
}

export interface Sheet {
  id: string
  owner_id: string
  workspace_id: string
  name: string
  description: string
  accent: string
  done_label: string
  position: number
  created_at: string
}

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

export interface WorkspaceDraft {
  name: string
  description: string
  accent: string
}

export interface SheetDraft {
  name: string
  description: string
  accent: string
  done_label: string
}

export interface FieldDraft {
  key: string
  name: string
  type: FieldType
  options: string[]
  required: boolean
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
 * Check one cell. Mirrors the validate_cells trigger in schema.sql, so you get
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
  return fields.map((f) => cellText(row.cells[f.key])).join(' ').toLowerCase()
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
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'field'
  if (!taken.includes(base)) return base
  let n = 2
  while (taken.includes(`${base}_${n}`)) n += 1
  return `${base}_${n}`
}

// ---------------------------------------------------------------------------
// database calls
// ---------------------------------------------------------------------------

function fail(what: string, error: { message: string } | null): never {
  throw new Error(`${what}: ${error?.message ?? 'unknown error'}`)
}

async function userId(): Promise<string> {
  const { data } = await supabase.auth.getUser()
  if (!data.user) throw new Error('You are signed out. Reload the page.')
  return data.user.id
}

export const api = {
  // -- profile --------------------------------------------------------------

  /**
   * The signed-in account's profile, or null if it has never been created.
   * `maybeSingle` rather than `single`, because "no row yet" is the normal
   * state for a brand-new account and is not an error.
   */
  async loadProfile(): Promise<Profile | null> {
    const id = await userId()
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (error) fail('Could not load your profile', error)
    return (data as Profile) ?? null
  },

  /** Creates the profile the first time, updates it every time after. */
  async saveProfile(dbName: string): Promise<Profile> {
    const id = await userId()
    const { data, error } = await supabase
      .from('profiles')
      .upsert({ id, db_name: dbName.trim(), onboarded: true })
      .select()
      .single()
    if (error) fail('Could not save your database name', error)
    return data as Profile
  },

  // -- reads ----------------------------------------------------------------
  async loadAll() {
    const [workspaces, sheets, fields, records] = await Promise.all([
      supabase.from('workspaces').select('*').order('position'),
      supabase.from('sheets').select('*').order('position'),
      supabase.from('fields').select('*').order('position'),
      supabase.from('records').select('*').order('position'),
    ])
    if (workspaces.error) fail('Could not load workspaces', workspaces.error)
    if (sheets.error) fail('Could not load sheets', sheets.error)
    if (fields.error) fail('Could not load columns', fields.error)
    if (records.error) fail('Could not load rows', records.error)
    return {
      workspaces: workspaces.data as Workspace[],
      sheets: sheets.data as Sheet[],
      fields: fields.data as Field[],
      records: records.data as Record_[],
    }
  },

  // -- workspaces -----------------------------------------------------------
  async createWorkspace(draft: WorkspaceDraft, position: number) {
    const owner_id = await userId()
    const { data, error } = await supabase
      .from('workspaces')
      .insert({
        owner_id,
        name: draft.name.trim(),
        description: draft.description.trim(),
        accent: draft.accent,
        position,
      })
      .select()
      .single()
    if (error) fail('Could not create workspace', error)
    return data as Workspace
  },

  async updateWorkspace(id: string, draft: WorkspaceDraft) {
    const { data, error } = await supabase
      .from('workspaces')
      .update({
        name: draft.name.trim(),
        description: draft.description.trim(),
        accent: draft.accent,
      })
      .eq('id', id)
      .select()
      .single()
    if (error) fail('Could not save workspace', error)
    return data as Workspace
  },

  async deleteWorkspace(id: string) {
    const { error } = await supabase.from('workspaces').delete().eq('id', id)
    if (error) fail('Could not delete workspace', error)
  },

  // -- sheets ---------------------------------------------------------------
  async createSheet(workspaceId: string, draft: SheetDraft, position: number) {
    const owner_id = await userId()
    const { data, error } = await supabase
      .from('sheets')
      .insert({ owner_id, workspace_id: workspaceId, ...clean(draft), position })
      .select()
      .single()
    if (error) fail('Could not create sheet', error)
    return data as Sheet
  },

  async updateSheet(id: string, draft: SheetDraft) {
    const { data, error } = await supabase
      .from('sheets')
      .update(clean(draft))
      .eq('id', id)
      .select()
      .single()
    if (error) fail('Could not save sheet', error)
    return data as Sheet
  },

  async deleteSheet(id: string) {
    const { error } = await supabase.from('sheets').delete().eq('id', id)
    if (error) fail('Could not delete sheet', error)
  },

  // -- fields ---------------------------------------------------------------
  async createField(sheetId: string, draft: FieldDraft, position: number, isTitle = false) {
    const owner_id = await userId()
    const { data, error } = await supabase
      .from('fields')
      .insert({
        owner_id,
        sheet_id: sheetId,
        ...cleanField(draft),
        is_title: isTitle,
        position,
      })
      .select()
      .single()
    if (error) fail('Could not add column', error)
    return data as Field
  },

  async updateField(id: string, draft: FieldDraft) {
    const { data, error } = await supabase
      .from('fields')
      .update(cleanField(draft))
      .eq('id', id)
      .select()
      .single()
    if (error) fail('Could not save column', error)
    return data as Field
  },

  async deleteField(id: string) {
    const { error } = await supabase.from('fields').delete().eq('id', id)
    if (error) fail('Could not delete column', error)
  },

  async moveField(id: string, position: number) {
    const { error } = await supabase.from('fields').update({ position }).eq('id', id)
    if (error) fail('Could not reorder columns', error)
  },

  /** The partial unique index rejects two title columns, so clear before setting. */
  async setTitleField(sheetId: string, fieldId: string) {
    const cleared = await supabase
      .from('fields')
      .update({ is_title: false })
      .eq('sheet_id', sheetId)
      .eq('is_title', true)
    if (cleared.error) fail('Could not change the title column', cleared.error)
    const { error } = await supabase
      .from('fields')
      .update({ is_title: true })
      .eq('id', fieldId)
    if (error) fail('Could not change the title column', error)
  },

  // -- records --------------------------------------------------------------
  async createRecord(sheetId: string, fields: Field[], cells: Cells, position: number) {
    const owner_id = await userId()
    const { data, error } = await supabase
      .from('records')
      .insert({ owner_id, sheet_id: sheetId, cells: packCells(fields, cells), position })
      .select()
      .single()
    if (error) fail('Could not add row', error)
    return data as Record_
  },

  async updateRecord(id: string, fields: Field[], cells: Cells) {
    const { data, error } = await supabase
      .from('records')
      .update({ cells: packCells(fields, cells) })
      .eq('id', id)
      .select()
      .single()
    if (error) fail('Could not save row', error)
    return data as Record_
  },

  async setDone(id: string, done: boolean) {
    const { data, error } = await supabase
      .from('records')
      .update({ done })
      .eq('id', id)
      .select()
      .single()
    if (error) fail('Could not update row', error)
    return data as Record_
  },

  async deleteRecord(id: string) {
    const { error } = await supabase.from('records').delete().eq('id', id)
    if (error) fail('Could not delete row', error)
  },

  // -- group actions --------------------------------------------------------
  // Marking and deleting are one request for any number of rows.

  async bulkDone(ids: string[], done: boolean) {
    if (!ids.length) return []
    const { data, error } = await supabase
      .from('records')
      .update({ done })
      .in('id', ids)
      .select()
    if (error) fail(`Could not update ${ids.length} rows`, error)
    return data as Record_[]
  },

  async bulkDelete(ids: string[]) {
    if (!ids.length) return
    const { error } = await supabase.from('records').delete().in('id', ids)
    if (error) fail(`Could not delete ${ids.length} rows`, error)
  },

  async bulkDuplicate(rows: Record_[], basePosition: number) {
    if (!rows.length) return []
    const owner_id = await userId()
    const { data, error } = await supabase
      .from('records')
      .insert(
        rows.map((r, i) => ({
          owner_id,
          sheet_id: r.sheet_id,
          cells: r.cells,
          done: r.done,
          position: basePosition + (i + 1) * 100,
        })),
      )
      .select()
    if (error) fail(`Could not duplicate ${rows.length} rows`, error)
    return data as Record_[]
  },

  /** Set one column to one value across many rows. */
  async bulkSet(rows: Record_[], fields: Field[], key: string, value: Cell) {
    const out: Record_[] = []
    for (const row of rows) {
      const next = { ...row.cells, [key]: value }
      const { data, error } = await supabase
        .from('records')
        .update({ cells: packCells(fields, next) })
        .eq('id', row.id)
        .select()
        .single()
      if (error) fail('Could not update rows', error)
      out.push(data as Record_)
    }
    return out
  },
}

function clean(draft: SheetDraft) {
  return {
    name: draft.name.trim(),
    description: draft.description.trim(),
    accent: draft.accent,
    done_label: draft.done_label.trim() || 'Done',
  }
}

function cleanField(draft: FieldDraft) {
  return {
    key: draft.key,
    name: draft.name.trim(),
    type: draft.type,
    options: draft.options.map((o) => o.trim()).filter(Boolean),
    required: draft.required,
  }
}
