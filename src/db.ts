import { rowCalls } from './data/rows'
import { structureCalls } from './data/structure'

// The one entry point for data: features import api, supabase and the types from here.
export * from './values'
export * from './data/types'
export { supabase } from './data/client'

export const api = {
  ...structureCalls,
  ...rowCalls,

  async loadAll() {
    const [workspaces, sheets, fields, counts] = await Promise.all([
      structureCalls.loadWorkspaces(),
      structureCalls.loadSheets(),
      structureCalls.loadFields(),
      structureCalls.loadSheetCounts(),
    ])
    return { workspaces, sheets, fields, counts: counts.counts, countsError: counts.error }
  },
}
