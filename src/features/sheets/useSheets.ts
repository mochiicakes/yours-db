import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  api,
  type Cells,
  type Field,
  type ImportField,
  type Sheet,
  type SheetDraft,
  type Workspace,
} from '../../db'
import { keys, patch } from '../../app/cache'
import { useFeedback } from '../../app/feedback'
import { useCreateField } from '../columns/useFields'

const NAME_COLUMN = {
  key: 'name',
  name: 'Name',
  type: 'text',
  options: [],
  required: true,
} as const

export function useSheets() {
  return useQuery({ queryKey: keys.sheets, queryFn: () => api.loadSheets() })
}

export function useSheetActions({
  onCreated,
  onDeleted,
}: {
  onCreated: (id: string) => void
  onDeleted: (id: string) => void
}) {
  const qc = useQueryClient()
  const { say } = useFeedback()
  const createField = useCreateField()

  const create = useMutation({
    mutationFn: (v: { workspaceId: string; draft: SheetDraft; position: number }) =>
      api.createSheet(v.workspaceId, v.draft, v.position),
  })
  const update = useMutation({
    mutationFn: (v: { id: string; draft: SheetDraft }) => api.updateSheet(v.id, v.draft),
  })
  const remove = useMutation({ mutationFn: (id: string) => api.deleteSheet(id) })
  const duplicate = useMutation({
    mutationFn: (v: { id: string; withRows: boolean }) => api.duplicateSheet(v.id, v.withRows),
  })

  function forget(id: string) {
    patch<Sheet>(qc, keys.sheets, (ss) => ss.filter((s) => s.id !== id))
    patch<Field>(qc, keys.fields, (fs) => fs.filter((f) => f.sheet_id !== id))
    qc.removeQueries({ queryKey: keys.records(id) })
  }

  async function save(
    editing: Sheet | null,
    draft: SheetDraft,
    workspace: Workspace | null,
    siblings: Sheet[],
  ): Promise<boolean> {
    if (editing) {
      try {
        const saved = await update.mutateAsync({ id: editing.id, draft })
        patch<Sheet>(qc, keys.sheets, (ss) => ss.map((s) => (s.id === saved.id ? saved : s)))
        say('Saved')
        return true
      } catch {
        return false
      }
    }
    if (!workspace) return false
    const position = siblings.reduce((m, s) => Math.max(m, s.position), 0) + 100
    let created: Sheet
    try {
      created = await create.mutateAsync({ workspaceId: workspace.id, draft, position })
    } catch {
      return false
    }
    // A sheet with no columns cannot hold anything, so give it one immediately.
    const first = await createField
      .mutateAsync({
        sheetId: created.id,
        draft: { ...NAME_COLUMN, options: [] },
        position: 10,
        isTitle: true,
      })
      .catch(() => null)
    patch<Sheet>(qc, keys.sheets, (ss) => [...ss, created])
    if (first) patch<Field>(qc, keys.fields, (fs) => [...fs, first])
    qc.setQueryData(keys.records(created.id), [])
    onCreated(created.id)
    say(`Created "${created.name}"`)
    return true
  }

  async function destroy(target: Sheet): Promise<boolean> {
    try {
      await remove.mutateAsync(target.id)
    } catch {
      return false
    }
    forget(target.id)
    say('Sheet deleted')
    return true
  }

  async function destroyFromList(target: Sheet) {
    const message = `Delete "${target.name}", its columns and every row in it? This cannot be undone.`
    if (!window.confirm(message)) return
    try {
      await remove.mutateAsync(target.id)
    } catch {
      return
    }
    forget(target.id)
    onDeleted(target.id)
    say('Sheet deleted')
  }

  async function copy(target: Sheet, includeContents: boolean) {
    let made
    try {
      made = await duplicate.mutateAsync({ id: target.id, withRows: includeContents })
    } catch {
      return
    }
    patch<Sheet>(qc, keys.sheets, (ss) => [...ss, made.sheet])
    patch<Field>(qc, keys.fields, (fs) => [...fs, ...made.fields])
    qc.setQueryData(keys.records(made.sheet.id), made.records)
    say(
      includeContents
        ? `Duplicated "${target.name}" with its contents`
        : `Duplicated "${target.name}" without contents`,
    )
  }

  // Tabs go one after another, so each gets its own requests and timeouts. A
  // failed tab is reported and the rest carry on. Plain calls, not mutations:
  // the shared error banner would let one tab's success clear another's failure.
  async function importSheets(
    workspaceId: string,
    jobs: ImportJob[],
    onProgress?: (p: ImportProgress) => void,
  ): Promise<ImportOutcome> {
    const imported: Sheet[] = []
    const failed: ImportOutcome['failed'] = []
    let rows = 0
    for (const [index, job] of jobs.entries()) {
      const report = (rowsDone: number) =>
        onProgress?.({
          index,
          count: jobs.length,
          name: job.name,
          rowsDone,
          rowsTotal: job.rows.length,
        })
      report(0)
      try {
        const made = await api.importSheet(workspaceId, job.name, job.fields, job.rows, report)
        // The cache is touched only once every batch is in, so a half-made sheet never shows.
        patch<Sheet>(qc, keys.sheets, (ss) => [...ss, made.sheet])
        patch<Field>(qc, keys.fields, (fs) => [...fs, ...made.fields])
        imported.push(made.sheet)
        rows += job.rows.length
      } catch (e) {
        failed.push({ index, name: job.name, message: (e as Error).message })
      }
    }
    if (imported.length > 0) {
      // Rows load when the sheet opens; the list's row counts come from the server.
      void qc.invalidateQueries({ queryKey: keys.counts })
      onCreated(imported[0].id)
      const total = `${rows.toLocaleString()} ${rows === 1 ? 'row' : 'rows'}`
      say(
        failed.length > 0
          ? `Imported ${imported.length} of ${jobs.length} sheets`
          : imported.length === 1
            ? `Imported "${imported[0].name}" (${total})`
            : `Imported ${imported.length} sheets (${total})`,
      )
    }
    return { imported, failed }
  }

  return { save, destroy, destroyFromList, copy, importSheets }
}

export interface ImportJob {
  name: string
  fields: ImportField[]
  rows: Cells[]
}

export interface ImportProgress {
  index: number
  count: number
  name: string
  rowsDone: number
  rowsTotal: number
}

export interface ImportOutcome {
  imported: Sheet[]
  // index points back into the jobs passed in, so the dialog can retry just these.
  failed: { index: number; name: string; message: string }[]
}
