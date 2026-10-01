import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type Field, type Sheet, type Workspace, type WorkspaceDraft } from '../../db'
import { keys, patch } from '../../app/cache'
import { useFeedback } from '../../app/feedback'

export function useWorkspaces() {
  return useQuery({ queryKey: keys.workspaces, queryFn: () => api.loadWorkspaces() })
}

export function useWorkspaceActions({
  onCreated,
  onDeleted,
}: {
  onCreated: (id: string) => void
  onDeleted: (id: string) => void
}) {
  const qc = useQueryClient()
  const { say } = useFeedback()

  const create = useMutation({
    mutationFn: (v: { draft: WorkspaceDraft; position: number }) =>
      api.createWorkspace(v.draft, v.position),
  })
  const update = useMutation({
    mutationFn: (v: { id: string; draft: WorkspaceDraft }) => api.updateWorkspace(v.id, v.draft),
  })
  const remove = useMutation({ mutationFn: (id: string) => api.deleteWorkspace(id) })

  async function save(editing: Workspace | null, draft: WorkspaceDraft): Promise<boolean> {
    try {
      if (editing) {
        const saved = await update.mutateAsync({ id: editing.id, draft })
        patch<Workspace>(qc, keys.workspaces, (ws) =>
          ws.map((w) => (w.id === saved.id ? saved : w)),
        )
        say('Saved')
        return true
      }
      const all = qc.getQueryData<Workspace[]>(keys.workspaces) ?? []
      const position = all.reduce((m, w) => Math.max(m, w.position), 0) + 100
      const created = await create.mutateAsync({ draft, position })
      patch<Workspace>(qc, keys.workspaces, (ws) => [...ws, created])
      onCreated(created.id)
      say(`Created "${created.name}"`)
      return true
    } catch {
      return false
    }
  }

  async function destroy(target: Workspace): Promise<boolean> {
    try {
      await remove.mutateAsync(target.id)
    } catch {
      return false
    }
    const sheets = qc.getQueryData<Sheet[]>(keys.sheets) ?? []
    const gone = new Set(sheets.filter((s) => s.workspace_id === target.id).map((s) => s.id))
    patch<Workspace>(qc, keys.workspaces, (ws) => ws.filter((w) => w.id !== target.id))
    patch<Sheet>(qc, keys.sheets, (ss) => ss.filter((s) => s.workspace_id !== target.id))
    patch<Field>(qc, keys.fields, (fs) => fs.filter((f) => !gone.has(f.sheet_id)))
    for (const id of gone) qc.removeQueries({ queryKey: keys.records(id) })
    onDeleted(target.id)
    say('Workspace deleted')
    return true
  }

  return { save, destroy }
}
