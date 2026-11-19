import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api, type Record_, type Sheet } from '../../db'
import { keys } from '../../app/cache'

function useSheetCounts() {
  return useQuery({ queryKey: keys.counts, queryFn: () => api.loadSheetCounts() })
}

function readLoaded(qc: QueryClient): Map<string, Record_[]> {
  const out = new Map<string, Record_[]>()
  for (const [key, data] of qc.getQueriesData<Record_[]>({ queryKey: keys.allRecords })) {
    if (data) out.set(key[1] as string, data)
  }
  return out
}

function sameMap(a: Map<string, Record_[]>, b: Map<string, Record_[]>) {
  if (a.size !== b.size) return false
  for (const [k, v] of a) if (b.get(k) !== v) return false
  return true
}

// Every sheet whose rows are cached, kept in step with the query cache.
function useLoadedRecords(): Map<string, Record_[]> {
  const qc = useQueryClient()
  const [loaded, setLoaded] = useState(() => readLoaded(qc))
  useEffect(
    () =>
      qc.getQueryCache().subscribe(() => {
        const next = readLoaded(qc)
        setLoaded((prev) => (sameMap(prev, next) ? prev : next))
      }),
    [qc],
  )
  return loaded
}

// Loaded sheets count rows in memory so edits show at once. Unknown counts stay missing and show as "– rows".
export function useRowCounts(sheets: Sheet[]) {
  const counts = useSheetCounts()
  const loaded = useLoadedRecords()
  const server = counts.data?.counts ?? null

  return useMemo(() => {
    const rows = new Map<string, number>()
    const done = new Map<string, number>()
    if (server !== null) for (const s of sheets) rows.set(s.id, 0)
    for (const c of server ?? []) {
      if (loaded.has(c.sheet_id)) continue
      rows.set(c.sheet_id, c.total)
      done.set(c.sheet_id, c.done)
    }
    for (const [id, list] of loaded) {
      rows.set(id, list.length)
      const ticked = list.filter((r) => r.done).length
      if (ticked) done.set(id, ticked)
      else done.delete(id)
    }
    const total = [...rows.values()].reduce((a, b) => a + b, 0)
    return { rows, done, total, warning: counts.data?.error ?? null, pending: counts.isPending }
  }, [sheets, server, loaded, counts.data?.error, counts.isPending])
}
