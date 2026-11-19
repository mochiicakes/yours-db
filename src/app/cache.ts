import { useCallback } from 'react'
import { useIsMutating, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useFeedback } from './feedback'

export const keys = {
  workspaces: ['workspaces'] as const,
  sheets: ['sheets'] as const,
  fields: ['fields'] as const,
  counts: ['sheetCounts'] as const,
  records: (sheetId: string) => ['records', sheetId] as const,
  allRecords: ['records'] as const,
}

export function patch<T>(qc: QueryClient, key: readonly unknown[], fn: (prev: T[]) => T[]) {
  qc.setQueryData<T[]>(key, (prev) => fn(prev ?? []))
}

// Leaves an unloaded list unloaded, so a sheet whose rows were never fetched is not mistaken for an empty one.
export function patchIfLoaded<T>(qc: QueryClient, key: readonly unknown[], fn: (prev: T[]) => T[]) {
  qc.setQueryData<T[]>(key, (prev) => (prev ? fn(prev) : prev))
}

export function useBusy(): boolean {
  return useIsMutating() > 0
}

// Drops every cached list and loads again, like a fresh visit. Clears the banner once the load succeeds.
export function useReload() {
  const qc = useQueryClient()
  const { setError } = useFeedback()
  return useCallback(async () => {
    await qc.resetQueries()
    const ok = [keys.workspaces, keys.sheets, keys.fields].every(
      (k) => qc.getQueryState(k)?.status === 'success',
    )
    if (ok) setError(null)
  }, [qc, setError])
}
