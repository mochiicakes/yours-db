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

describe('loadAll', () => {
  it('still loads workspaces, sheets and fields when sheet_counts is missing', async () => {
    countsResult = {
      data: null,
      error: {
        code: 'PGRST202',
        message:
          'Could not find the function public.sheet_counts without parameters in the schema cache',
      },
    }
    const all = await api.loadAll()
    expect(all.workspaces).toHaveLength(1)
    expect(all.sheets).toHaveLength(1)
    expect(all.fields).toHaveLength(1)
    expect(all.counts).toBeNull()
    expect(all.countsError).toContain('sheet_counts')
  })

  it('returns the counts when sheet_counts works', async () => {
    countsResult = { data: [{ sheet_id: 's1', total: 3, done: 1 }], error: null }
    const all = await api.loadAll()
    expect(all.counts).toEqual([{ sheet_id: 's1', total: 3, done: 1 }])
    expect(all.countsError).toBeNull()
  })
})
