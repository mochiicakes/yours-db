import { beforeEach, describe, expect, it, vi } from 'vitest'

const tables: Record<string, unknown[]> = {}
let countsResult: { data: unknown; error: { message: string; code?: string } | null }

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        range: () => Promise.resolve({ data: tables[table] ?? [], error: null }),
      }
      return query
    },
    rpc: () => Promise.resolve(countsResult),
  }),
}))

vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
vi.stubEnv('VITE_SUPABASE_KEY', 'test-key')

const { api } = await import('./db')

beforeEach(() => {
  tables.workspaces = [{ id: 'w1', name: 'W' }]
  tables.sheets = [{ id: 's1', workspace_id: 'w1', name: 'S' }]
  tables.fields = [{ id: 'f1', sheet_id: 's1', key: 'name' }]
})

describe('loading', () => {
  it('loads workspaces, sheets and fields without touching sheet_counts', async () => {
    countsResult = { data: null, error: { code: 'PGRST202', message: 'should not be called' } }
    expect(await api.loadWorkspaces()).toHaveLength(1)
    expect(await api.loadSheets()).toHaveLength(1)
    expect(await api.loadFields()).toHaveLength(1)
  })

  it('reports a missing sheet_counts as counts: null instead of rejecting', async () => {
    countsResult = {
      data: null,
      error: {
        code: 'PGRST202',
        message:
          'Could not find the function public.sheet_counts without parameters in the schema cache',
      },
    }
    const result = await api.loadSheetCounts()
    expect(result.counts).toBeNull()
    expect(result.error).toContain('sheet_counts')
  })

  it('returns the counts when sheet_counts works', async () => {
    countsResult = { data: [{ sheet_id: 's1', total: 3, done: 1 }], error: null }
    const result = await api.loadSheetCounts()
    expect(result.counts).toEqual([{ sheet_id: 's1', total: 3, done: 1 }])
    expect(result.error).toBeNull()
  })
})
