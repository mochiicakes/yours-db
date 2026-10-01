import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api, rowTitle, type Cells, type Field, type Record_, type Sheet } from '../../db'
import { keys, patch } from '../../app/cache'
import { useFeedback } from '../../app/feedback'
import { nextPosition, nextPositions, planMove } from '../../reorder'

export function useRecords(sheetId: string | null) {
  const { setError } = useFeedback()
  const query = useQuery({
    queryKey: keys.records(sheetId ?? ''),
    queryFn: () => api.loadRecords(sheetId!),
    enabled: !!sheetId,
  })
  useEffect(() => {
    if (query.error) setError(query.error.message)
  }, [query.error, setError])
  return query
}

// Optimistic edit of one sheet's rows; the returned snapshot is what onError puts back.
async function optimistic(
  qc: QueryClient,
  sheetId: string,
  change: (rows: Record_[]) => Record_[],
) {
  const key = keys.records(sheetId)
  await qc.cancelQueries({ queryKey: key })
  const previous = qc.getQueryData<Record_[]>(key)
  patch<Record_>(qc, key, change)
  return { key, previous }
}

type Snapshot = { key: readonly unknown[]; previous: Record_[] | undefined }
const rollback = (qc: QueryClient) => (_e: unknown, _v: unknown, snap?: Snapshot) => {
  if (snap) qc.setQueryData(snap.key, snap.previous)
}

function replaceAll(qc: QueryClient, sheetId: string, saved: Record_[]) {
  const byId = new Map(saved.map((r) => [r.id, r]))
  patch<Record_>(qc, keys.records(sheetId), (rows) => rows.map((r) => byId.get(r.id) ?? r))
}

export function useRowActions(sheet: Sheet | null, sheetFields: Field[], reload: () => void) {
  const qc = useQueryClient()
  const { say } = useFeedback()
  const sheetId = sheet?.id ?? ''
  const rowsNow = () => qc.getQueryData<Record_[]>(keys.records(sheetId)) ?? []

  const create = useMutation({
    mutationFn: (v: { cells: Cells; position: number }) =>
      api.createRecord(sheetId, sheetFields, v.cells, v.position),
  })
  const update = useMutation({
    mutationFn: (v: { id: string; cells: Cells }) => api.updateRecord(v.id, sheetFields, v.cells),
  })
  const toggle = useMutation({
    mutationFn: (row: Record_) => api.setDone(row.id, !row.done),
    onMutate: (row) =>
      optimistic(qc, row.sheet_id, (rs) =>
        rs.map((r) => (r.id === row.id ? { ...r, done: !row.done } : r)),
      ),
    onError: rollback(qc),
    onSuccess: (saved) => replaceAll(qc, saved.sheet_id, [saved]),
  })
  const remove = useMutation({
    mutationFn: (row: Record_) => api.deleteRecord(row.id),
    onMutate: (row) => optimistic(qc, row.sheet_id, (rs) => rs.filter((r) => r.id !== row.id)),
    onError: rollback(qc),
    onSuccess: () => say('Deleted'),
  })
  const groupDoneM = useMutation({
    mutationFn: (v: { ids: string[]; done: boolean }) => api.bulkDone(v.ids, v.done),
    onMutate: ({ ids, done }) =>
      optimistic(qc, sheetId, (rs) => rs.map((r) => (ids.includes(r.id) ? { ...r, done } : r))),
    onError: rollback(qc),
    onSuccess: (saved, { ids }) => {
      replaceAll(qc, sheetId, saved)
      say(`${ids.length} rows updated`)
    },
  })
  const groupDeleteM = useMutation({
    mutationFn: (ids: string[]) => api.bulkDelete(ids),
    onMutate: (ids) => optimistic(qc, sheetId, (rs) => rs.filter((r) => !ids.includes(r.id))),
    onError: rollback(qc),
  })
  const duplicateM = useMutation({
    mutationFn: (v: { rows: Record_[]; positions: number[] }) =>
      api.bulkDuplicate(v.rows, v.positions),
  })
  const setM = useMutation({
    mutationFn: (v: { ids: string[]; key: string; value: string }) =>
      api.bulkSet(v.ids, sheetFields, v.key, v.value),
  })
  const moveM = useMutation({
    mutationFn: async ({ activeId, overId }: { activeId: string; overId: string }) => {
      let sorted = [...rowsNow()].sort((a, b) => a.position - b.position)
      let plan = planMove(sorted, activeId, overId)
      if (plan?.kind === 'renumber') {
        const pos = new Map((await api.renumberSheet(sheetId)).map((r) => [r.id, r.position]))
        const respace = (r: Record_) => (pos.has(r.id) ? { ...r, position: pos.get(r.id)! } : r)
        sorted = sorted.map(respace).sort((a, b) => a.position - b.position)
        patch<Record_>(qc, keys.records(sheetId), (rs) => rs.map(respace))
        plan = planMove(sorted, activeId, overId)
      }
      if (plan?.kind !== 'one') return
      const { position } = plan
      patch<Record_>(qc, keys.records(sheetId), (rs) =>
        rs.map((r) => (r.id === activeId ? { ...r, position } : r)),
      )
      await api.moveRecord(sheetId, activeId, position)
    },
  })

  async function save(editing: Record_ | null, cells: Cells): Promise<boolean> {
    if (!sheet) return false
    try {
      if (editing) {
        const saved = await update.mutateAsync({ id: editing.id, cells })
        replaceAll(qc, sheetId, [saved])
        say('Saved')
        return true
      }
      const created = await create.mutateAsync({ cells, position: nextPosition(rowsNow()) })
      patch<Record_>(qc, keys.records(sheetId), (rs) => [...rs, created])
      say('Row added')
      return true
    } catch {
      return false
    }
  }

  function deleteRow(row: Record_) {
    if (!window.confirm(`Delete "${rowTitle(sheetFields, row)}"? This cannot be undone.`)) return
    remove.mutate(row)
  }

  async function move(activeId: string, overId: string, searching: boolean) {
    if (!sheet || searching) return
    const sorted = [...rowsNow()].sort((a, b) => a.position - b.position)
    if (!planMove(sorted, activeId, overId)) return
    const ok = await moveM.mutateAsync({ activeId, overId }).then(
      () => true,
      () => false,
    )
    if (!ok) reload()
  }

  async function groupDelete(ids: string[]): Promise<boolean> {
    if (!window.confirm(`Delete ${ids.length} rows? This cannot be undone.`)) return false
    try {
      await groupDeleteM.mutateAsync(ids)
    } catch {
      return false
    }
    say('Rows deleted')
    return true
  }

  async function groupDuplicate(ids: string[]): Promise<boolean> {
    if (!sheet) return false
    const chosen = rowsNow().filter((r) => ids.includes(r.id))
    try {
      const positions = nextPositions(rowsNow(), chosen.length)
      const created = await duplicateM.mutateAsync({ rows: chosen, positions })
      patch<Record_>(qc, keys.records(sheetId), (rs) => [...rs, ...created])
      say(`Duplicated ${created.length} rows`)
      return true
    } catch {
      return false
    }
  }

  async function groupSet(ids: string[], key: string, value: string) {
    try {
      const saved = await setM.mutateAsync({ ids, key, value })
      replaceAll(qc, sheetId, saved)
      say(`${saved.length} rows updated`)
    } catch {
      // The banner already shows why.
    }
  }

  return {
    save,
    toggleDone: (row: Record_) => toggle.mutate(row),
    deleteRow,
    move,
    groupDone: (ids: string[], done: boolean) => groupDoneM.mutate({ ids, done }),
    groupDelete,
    groupDuplicate,
    groupSet,
  }
}
