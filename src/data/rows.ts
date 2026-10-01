import {
  coerce,
  isBlank,
  packCells,
  type Cell,
  type Cells,
  type Field,
  type Record_,
} from '../values'
import { fail, fetchAll, supabase } from './client'

export const rowCalls = {
  async loadRecords(sheetId: string) {
    return fetchAll<Record_>('records', sheetId)
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
