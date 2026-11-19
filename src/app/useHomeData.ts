import { useEffect, useMemo, useState } from 'react'
import type { Sheet } from '../db'
import { useFields } from '../features/columns/useFields'
import { useRowCounts } from '../features/sheets/useRowCounts'
import { useSheets } from '../features/sheets/useSheets'
import { useWorkspaces } from '../features/workspaces/useWorkspaces'

function countBy(sheets: Sheet[]) {
  const map = new Map<string, number>()
  for (const s of sheets) map.set(s.workspace_id, (map.get(s.workspace_id) ?? 0) + 1)
  return map
}

// Everything the signed-in screen reads, and which workspace and sheet are open.
export function useHomeData() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [sheetId, setSheetId] = useState<string | null>(null)

  const workspacesQ = useWorkspaces()
  const sheetsQ = useSheets()
  const fieldsQ = useFields()
  const workspaces = useMemo(() => workspacesQ.data ?? [], [workspacesQ.data])
  const sheets = useMemo(() => sheetsQ.data ?? [], [sheetsQ.data])
  const fields = useMemo(() => fieldsQ.data ?? [], [fieldsQ.data])
  const counts = useRowCounts(sheets)

  const loadError = workspacesQ.error ?? sheetsQ.error ?? fieldsQ.error
  const loading = workspacesQ.isPending || sheetsQ.isPending || fieldsQ.isPending || counts.pending

  const openWorkspace = workspaces.find((w) => w.id === workspaceId) ?? null
  const workspaceSheets = useMemo(
    () =>
      sheets.filter((s) => s.workspace_id === workspaceId).sort((a, b) => a.position - b.position),
    [sheets, workspaceId],
  )
  const sheetsPerWorkspace = useMemo(() => countBy(sheets), [sheets])

  // Land on the first workspace, and never hold an id for one that is gone.
  useEffect(() => {
    if (!workspaces.length) {
      setWorkspaceId(null)
      return
    }
    if (!workspaces.some((w) => w.id === workspaceId)) setWorkspaceId(workspaces[0].id)
  }, [workspaces, workspaceId])

  // Leaving a workspace closes whatever sheet was open inside it.
  useEffect(() => {
    if (sheetId && !workspaceSheets.some((s) => s.id === sheetId)) setSheetId(null)
  }, [workspaceSheets, sheetId])

  const sheet = workspaceSheets.find((s) => s.id === sheetId) ?? null
  const sheetFields = useMemo(
    () => fields.filter((f) => f.sheet_id === sheetId).sort((a, b) => a.position - b.position),
    [fields, sheetId],
  )

  return {
    workspaceId,
    setWorkspaceId,
    sheetId,
    setSheetId,
    workspaces,
    sheets,
    counts,
    loading,
    loadError,
    openWorkspace,
    workspaceSheets,
    sheetsPerWorkspace,
    sheet,
    sheetFields,
  }
}
