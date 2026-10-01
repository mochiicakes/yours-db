import { createClient } from '@supabase/supabase-js'
import {
  coerce,
  isBlank,
  packCells,
  type Cell,
  type Cells,
  type Field,
  type FieldType,
  type Record_,
} from './values'

export * from './values'

/**
 * Types, the Supabase client, and every database call the app makes.
 *
 * There is no backend server: Supabase exposes the Postgres tables as a REST
 * API and the policies in supabase/migrations decide what each request may touch. These
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
// database calls
// ---------------------------------------------------------------------------

function fail(what: string, error: { message: string } | null): never {
  throw new Error(`${what}: ${error?.message ?? 'unknown error'}`)
}

/**
 * The signed-in user's id, from the local session: no request. Only profiles
 * need it (their id is the user id). Every other table fills owner_id from its
 * default, auth.uid(), and RLS refuses any other value, so the browser never
 * has to send it and cannot forge it.
 */
async function userId(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  if (!data.session) throw new Error('You are signed out. Reload the page.')
  return data.session.user.id
}

/**
 * Fetch an entire table, page by page. PostgREST caps a single response at
 * 1000 rows, and a cap that returns partial data with no error is worse than
 * an error — the UI would silently drop everything past the first thousand.
 * So we page explicitly until a short page tells us we have reached the end.
 */
async function fetchAll<T>(table: string, sheetId?: string): Promise<T[]> {
  const PAGE = 1000
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    let query = supabase.from(table).select('*')
    if (sheetId) query = query.eq('sheet_id', sheetId)
    const { data, error } = await query
      // position alone ties across sheets, and Postgres does not keep tied
      // rows in a stable order between LIMIT/OFFSET pages. id breaks the tie.
      .order('position')
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) fail(`Could not load ${table}`, error)
    const batch = (data ?? []) as T[]
    out.push(...batch)
    if (batch.length < PAGE) break
  }
  return out
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
    const { data, error } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle()
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
      fetchAll<Workspace>('workspaces'),
      fetchAll<Sheet>('sheets'),
      fetchAll<Field>('fields'),
      fetchAll<Record_>('records'),
    ])
    return { workspaces, sheets, fields, records }
  },

  // -- workspaces -----------------------------------------------------------
  async createWorkspace(draft: WorkspaceDraft, position: number) {
    const { data, error } = await supabase
      .from('workspaces')
      .insert({
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
    const { data, error } = await supabase
      .from('sheets')
      .insert({ workspace_id: workspaceId, ...clean(draft), position })
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

  /**
   * Copy a sheet, its columns and optionally its rows in one transaction
   * (duplicate_sheet), then read the copy back.
   */
  async duplicateSheet(sourceId: string, includeContents: boolean) {
    const { data: id, error } = await supabase.rpc('duplicate_sheet', {
      p_source: sourceId,
      p_with_rows: includeContents,
    })
    if (error) fail('Could not duplicate sheet', error)
    const [sheet, fields, records] = await Promise.all([
      supabase.from('sheets').select('*').eq('id', id).single(),
      fetchAll<Field>('fields', id as string),
      fetchAll<Record_>('records', id as string),
    ])
    if (sheet.error) fail('Could not load the duplicated sheet', sheet.error)
    return { sheet: sheet.data as Sheet, fields, records }
  },

  // -- fields ---------------------------------------------------------------
  async createField(sheetId: string, draft: FieldDraft, position: number, isTitle = false) {
    const { data, error } = await supabase
      .from('fields')
      .insert({
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

  /**
   * Put one column at a new position. The sheet's columns are respaced in the
   * same transaction (move_field); returns every column's new position.
   */
  async moveField(id: string, position: number) {
    const { data, error } = await supabase.rpc('move_field', { p_field: id, p_position: position })
    if (error) fail('Could not reorder columns', error)
    return data as { id: string; position: number }[]
  },

  /** Clear the old title and set the new one in one transaction (set_title_field). */
  async setTitleField(sheetId: string, fieldId: string) {
    const { error } = await supabase.rpc('set_title_field', { p_sheet: sheetId, p_field: fieldId })
    if (error) fail('Could not change the title column', error)
  },

  // -- records --------------------------------------------------------------
  async createRecord(sheetId: string, fields: Field[], cells: Cells, position: number) {
    const { data, error } = await supabase
      .from('records')
      .insert({ sheet_id: sheetId, cells: packCells(fields, cells), position })
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

  async moveRecord(sheetId: string, id: string, position: number) {
    const { data, error } = await supabase
      .from('records')
      .update({ position })
      .eq('id', id)
      .eq('sheet_id', sheetId)
      .select('id')
    if (error) fail('Could not reorder rows', error)
    if (!data?.length) throw new Error('That row no longer exists. Reload the sheet.')
  },

  async renumberSheet(sheetId: string) {
    const { data, error } = await supabase.rpc('renumber_sheet', { p_sheet_id: sheetId })
    if (error) fail('Could not reorder rows', error)
    return data as { id: string; position: number }[]
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
    const { data, error } = await supabase.from('records').update({ done }).in('id', ids).select()
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
    const { data, error } = await supabase
      .from('records')
      .insert(
        rows.map((r, i) => ({
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

  /**
   * Set one column to one value across many rows: one UPDATE (bulk_set), so
   * if any row rejects the value, no row changes. A blank clears the column.
   */
  async bulkSet(ids: string[], fields: Field[], key: string, value: Cell) {
    if (!ids.length) return []
    const field = fields.find((f) => f.key === key)
    const v = field ? coerce(field, value) : value
    const { data, error } = await supabase.rpc('bulk_set', {
      p_ids: ids,
      p_key: key,
      p_value: isBlank(v) ? null : v,
    })
    if (error) fail(`Could not update ${ids.length} rows`, error)
    return data as Record_[]
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
