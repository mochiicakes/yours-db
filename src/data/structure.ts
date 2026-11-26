import type { Cells, Field, Record_ } from '../values'
import { batchRows } from './batch'
import { fail, fetchAll, supabase, userId } from './client'
import type {
  FieldDraft,
  ImportField,
  Profile,
  Sheet,
  SheetCount,
  SheetDraft,
  Workspace,
  WorkspaceDraft,
} from './types'

export const structureCalls = {
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

  async loadWorkspaces() {
    return fetchAll<Workspace>('workspaces')
  },

  async loadSheets() {
    return fetchAll<Sheet>('sheets')
  },

  async loadFields() {
    return fetchAll<Field>('fields')
  },

  // A failed sheet_counts returns counts: null and the error, never a rejection.
  async loadSheetCounts(): Promise<{ counts: SheetCount[] | null; error: string | null }> {
    const { data, error } = await supabase.rpc('sheet_counts')
    if (error) return { counts: null, error: error.message }
    return { counts: (data ?? []) as SheetCount[], error: null }
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

  // Rows go up in batches: import_sheet makes the sheet, columns and first batch,
  // then import_rows adds the rest. If a later batch fails the sheet is deleted,
  // so a failed import leaves nothing behind. Rows are not fetched back.
  async importSheet(
    workspaceId: string,
    name: string,
    fields: ImportField[],
    rows: Cells[],
    onProgress?: (rowsDone: number) => void,
  ): Promise<{ sheet: Sheet; fields: Field[] }> {
    const [first = [], ...rest] = batchRows(rows)
    const { data, error } = await supabase.rpc('import_sheet', {
      p_workspace: workspaceId,
      p_name: name,
      p_fields: fields,
      p_rows: first,
    })
    if (error) fail(`Could not import "${name}"`, error)
    const made = data as { sheet: Sheet; fields: Field[] }
    let done = first.length
    onProgress?.(done)

    for (const batch of rest) {
      const { error: batchError } = await supabase.rpc('import_rows', {
        p_sheet: made.sheet.id,
        p_rows: batch,
        p_start: done,
      })
      if (batchError) {
        const { error: cleanup } = await supabase.from('sheets').delete().eq('id', made.sheet.id)
        const leftover = cleanup
          ? ` A partly imported "${made.sheet.name}" was left behind; delete it from the sheet list.`
          : ''
        throw new Error(
          `Could not import "${name}" (stopped after ${done.toLocaleString()} rows): ${batchError.message.replace(/\.$/, '')}.${leftover}`,
        )
      }
      done += batch.length
      onProgress?.(done)
    }
    return made
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
