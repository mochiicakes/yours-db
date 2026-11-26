import { beforeEach, describe, expect, it, vi } from 'vitest'

const tables: Record<string, unknown[]> = {}
let countsResult: { data: unknown; error: { message: string; code?: string } | null }
type RpcResult = { data: unknown; error: { message: string } | null }
let rpcImpl: (name: string, args: Record<string, unknown>) => RpcResult = () => countsResult
const rpcCalls: { name: string; args: Record<string, unknown> }[] = []
const deleted: string[] = []
let deleteError: { message: string } | null = null

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        range: () => Promise.resolve({ data: tables[table] ?? [], error: null }),
        delete: () => ({
          eq: (_col: string, id: string) => {
            deleted.push(`${table}:${id}`)
            return Promise.resolve({ error: deleteError })
          },
        }),
      }
      return query
    },
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args })
      return Promise.resolve(rpcImpl(name, args))
    },
  }),
}))

vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
vi.stubEnv('VITE_SUPABASE_KEY', 'test-key')

const { api } = await import('./db')

beforeEach(() => {
  tables.workspaces = [{ id: 'w1', name: 'W' }]
  tables.sheets = [{ id: 's1', workspace_id: 'w1', name: 'S' }]
  tables.fields = [{ id: 'f1', sheet_id: 's1', key: 'name' }]
  rpcImpl = () => countsResult
  rpcCalls.length = 0
  deleted.length = 0
  deleteError = null
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

describe('importSheet', () => {
  const fields = [{ key: 'n', name: 'N', type: 'number' as const, options: [], is_title: true }]
  const rows = Array.from({ length: 2500 }, (_, i) => ({ n: i }))
  const made = { sheet: { id: 'new', name: 'Big' }, fields: [{ id: 'fx', key: 'n' }] }

  it('sends the first batch with the sheet, then the rest in order', async () => {
    rpcImpl = (name, args) =>
      name === 'import_sheet'
        ? { data: made, error: null }
        : { data: (args.p_rows as unknown[]).length, error: null }
    const progress: number[] = []
    const result = await api.importSheet('w1', 'Big', fields, rows, (n) => progress.push(n))

    expect(result).toEqual(made)
    expect(
      rpcCalls.map((c) => [c.name, (c.args.p_rows as unknown[]).length, c.args.p_start]),
    ).toEqual([
      ['import_sheet', 1000, undefined],
      ['import_rows', 1000, 1000],
      ['import_rows', 500, 2000],
    ])
    expect(rpcCalls[0].args).toMatchObject({ p_workspace: 'w1', p_name: 'Big', p_fields: fields })
    expect(rpcCalls[2].args.p_sheet).toBe('new')
    expect(progress).toEqual([1000, 2000, 2500])
    expect(deleted).toEqual([])
  })

  it('creates an empty sheet when there are no rows', async () => {
    rpcImpl = () => ({ data: made, error: null })
    await api.importSheet('w1', 'Empty', fields, [])
    expect(rpcCalls).toHaveLength(1)
    expect(rpcCalls[0].args.p_rows).toEqual([])
  })

  it('reports a failed first batch without deleting anything', async () => {
    rpcImpl = () => ({ data: null, error: { message: 'N must be a number.' } })
    await expect(api.importSheet('w1', 'Big', fields, rows)).rejects.toThrow(
      'Could not import "Big": N must be a number.',
    )
    expect(deleted).toEqual([])
  })

  it('deletes the half-made sheet when a later batch fails', async () => {
    rpcImpl = (name, args) =>
      name === 'import_sheet'
        ? { data: made, error: null }
        : args.p_start === 2000
          ? { data: null, error: { message: 'canceling statement due to statement timeout' } }
          : { data: 1000, error: null }
    await expect(api.importSheet('w1', 'Big', fields, rows)).rejects.toThrow(
      'Could not import "Big" (stopped after 2,000 rows): canceling statement due to statement timeout.',
    )
    expect(deleted).toEqual(['sheets:new'])
  })

  it('says so when the cleanup fails too', async () => {
    rpcImpl = (name) =>
      name === 'import_sheet'
        ? { data: made, error: null }
        : { data: null, error: { message: 'Failed to fetch' } }
    deleteError = { message: 'Failed to fetch' }
    await expect(api.importSheet('w1', 'Big', fields, rows)).rejects.toThrow(
      /A partly imported "Big" was left behind/,
    )
  })
})
