// The import dialog's state for each tab, and the rules for when it can be imported.
// Pure: no React, no Supabase.
import {
  buildImport,
  columnValues,
  convertColumn,
  planColumns,
  type ColumnPlan,
  type ColumnResult,
  type ImportField,
} from './infer'
import { ImportError, type Table, type Workbook } from './parse'
import type { Cells } from '../../values'

export const MAX_TABS = 20

export interface TabDraft {
  tab: string
  // The new sheet's name; starts as the tab name.
  name: string
  ticked: boolean
  table: Table | null
  // Why this tab cannot be imported at all (empty, too big).
  error: string | null
  // Worked out the first time the tab is ticked, then kept.
  plans: ColumnPlan[] | null
  results: ColumnResult[] | null
}

export interface ImportJobDraft {
  name: string
  fields: ImportField[]
  rows: Cells[]
}

function readTab(wb: Workbook, tab: string): Pick<TabDraft, 'table' | 'error'> {
  try {
    const table = wb.read(tab)
    if (table.headers.length === 0) return { table: null, error: 'This tab is empty.' }
    return { table, error: null }
  } catch (e) {
    if (e instanceof ImportError) return { table: null, error: e.message }
    throw e
  }
}

// Fills in guessed types for a tab that is ticked and has not been looked at yet.
export function prepare(d: TabDraft): TabDraft {
  if (!d.ticked || !d.table || d.plans) return d
  const plans = planColumns(d.table)
  const results = plans.map((p, i) => convertColumn(p.name, p.type, columnValues(d.table!, i)))
  return { ...d, plans, results }
}

// Every usable tab starts ticked, up to the tab limit.
export function openDrafts(wb: Workbook): TabDraft[] {
  let ticked = 0
  return wb.tabs.map((tab) => {
    const read = readTab(wb, tab)
    const tick = read.error === null && ticked < MAX_TABS
    if (tick) ticked += 1
    return prepare({ tab, name: tab, ticked: tick, ...read, plans: null, results: null })
  })
}

export function setTicked(d: TabDraft, ticked: boolean): TabDraft {
  if (d.error) return d
  return prepare({ ...d, ticked })
}

// Only a type change re-checks the column; a rename or untick does not.
export function setColumn(d: TabDraft, index: number, change: Partial<ColumnPlan>): TabDraft {
  if (!d.table || !d.plans || !d.results) return d
  const before = d.plans[index]
  const after = { ...before, ...change }
  const plans = d.plans.map((p, i) => (i === index ? after : p))
  const results =
    after.type === before.type
      ? d.results
      : d.results.map((r, i) =>
          i === index ? convertColumn(after.name, after.type, columnValues(d.table!, i)) : r,
        )
  return { ...d, plans, results }
}

// Cells that do not fit their column's type, counting only included columns.
export function problemCount(d: TabDraft): number {
  if (!d.plans || !d.results) return 0
  return d.results.reduce(
    (n, r, i) => n + (d.plans![i].include && r.problem ? r.problem.count : 0),
    0,
  )
}

// Why a ticked tab cannot be imported yet, or null when it is ready.
export function tabIssue(d: TabDraft): string | null {
  if (d.error) return d.error
  if (!d.plans) return null
  if (!d.name.trim()) return 'Give the sheet a name.'
  if (!d.plans.some((p) => p.include)) return 'Include at least one column.'
  const problems = problemCount(d)
  if (problems > 0) {
    return `${problems.toLocaleString()} ${problems === 1 ? 'cell does' : 'cells do'} not fit ${problems === 1 ? 'its' : 'their'} column type.`
  }
  return null
}

// What stops the whole import, or null when every ticked tab is ready.
export function importIssue(drafts: TabDraft[]): string | null {
  const ticked = drafts.filter((d) => d.ticked)
  if (ticked.length === 0) return 'Tick at least one tab to import.'
  if (ticked.length > MAX_TABS) return `Import at most ${MAX_TABS} tabs at a time.`
  const blocked = ticked.find((d) => tabIssue(d) !== null)
  if (!blocked) return null
  return ticked.length > 1 ? `${blocked.tab}: ${tabIssue(blocked)}` : tabIssue(blocked)
}

export function toJob(d: TabDraft): ImportJobDraft {
  const built = buildImport(d.table!, d.plans!, d.results!)
  return { name: d.name.trim(), fields: built.fields, rows: built.rows }
}
