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

// Supabase client, row types and every database call. RLS decides what each request may touch.
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

export interface SheetCount {
  sheet_id: string
  total: number
  done: number
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

// Read from the local session, so no request. Only profiles need it; other tables default owner_id to auth.uid().
async function userId(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  if (!data.session) throw new Error('You are signed out. Reload the page.')
  return data.session.user.id
}

// PostgREST caps a response at 1000 rows, so page until a short page comes back.
async function fetchAll<T>(table: string, sheetId?: string): Promise<T[]> {
  const PAGE = 1000
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    let query = supabase.from(table).select('*')
    if (sheetId) query = query.eq('sheet_id', sheetId)
    const { data, error } = await query
      // id breaks position ties so rows cannot shift between pages.
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

  async loadProfile(): Promise<Profile | null> {
    const id = await userId()
    const { data, error } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle()
    if (error) fail('Could not load your profile', error)
    return (data as Profile) ?? null
  },

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

  // Rows load per sheet. A failed sheet_counts returns counts: null instead of failing the whole load.
  async loadAll() {
    const [workspaces, sheets, fields, counts] = await Promise.all([
      fetchAll<Workspace>('workspaces'),
      fetchAll<Sheet>('sheets'),
      fetchAll<Field>('fields'),
      supabase.rpc('sheet_counts'),
    ])
    return {
      workspaces,
      sheets,
      fields,
      counts: counts.error ? null : ((counts.data ?? []) as SheetCount[]),
      countsError: counts.error?.message ?? null,
    }
  },

  async loadRecords(sheetId: string) {
    return fetchAll<Record_>('records', sheetId)
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

  // The server respaces the sheet's columns and returns their new positions.
  async moveField(id: string, position: number) {
    const { data, error } = await supabase.rpc('move_field', { p_field: id, p_position: position })
    if (error) fail('Could not reorder columns', error)
    return data as { id: string; position: number }[]
  },

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

  async bulkDuplicate(rows: Record_[], positions: number[]) {
    if (!rows.length) return []
    const { data, error } = await supabase
      .from('records')
      .insert(
        rows.map((r, i) => ({
          sheet_id: r.sheet_id,
          cells: r.cells,
          done: r.done,
          position: positions[i],
        })),
      )
      .select()
    if (error) fail(`Could not duplicate ${rows.length} rows`, error)
    return data as Record_[]
  },

  // One UPDATE: if any row rejects the value, no row changes. A blank clears the column.
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
