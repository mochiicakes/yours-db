// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Field, Record_, Sheet, Workspace } from './db'

// In-memory stand-in for the database calls in src/db.ts; every method is a spy.
const backend = vi.hoisted(() => {
  type Row = Record<string, unknown> & { id: string }
  const state = {
    workspaces: [] as Row[],
    sheets: [] as Row[],
    fields: [] as Row[],
    records: [] as Row[],
    next: 1,
  }
  const id = (prefix: string) => `${prefix}-${state.next++}`
  const copy = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T
  const now = '2026-01-01T00:00:00Z'
  const counts = () => {
    const map = new Map<string, { sheet_id: string; total: number; done: number }>()
    for (const r of state.records) {
      const c = map.get(r.sheet_id as string) ?? {
        sheet_id: r.sheet_id as string,
        total: 0,
        done: 0,
      }
      c.total += 1
      if (r.done) c.done += 1
      map.set(c.sheet_id, c)
    }
    return [...map.values()]
  }
  const byPos = (a: Row, b: Row) => (a.position as number) - (b.position as number)

  const api = {
    loadProfile: vi.fn(async () => ({
      id: 'u1',
      db_name: 'mine',
      onboarded: true,
      created_at: now,
    })),
    saveProfile: vi.fn(async (name: string) => ({
      id: 'u1',
      db_name: name,
      onboarded: true,
      created_at: now,
    })),
    loadAll: vi.fn(async () => ({
      workspaces: copy(state.workspaces),
      sheets: copy(state.sheets),
      fields: copy(state.fields),
      counts: counts(),
      countsError: null,
    })),
    loadWorkspaces: vi.fn(async () => copy(state.workspaces)),
    loadSheets: vi.fn(async () => copy(state.sheets)),
    loadFields: vi.fn(async () => copy(state.fields)),
    loadSheetCounts: vi.fn(async () => ({ counts: counts(), error: null })),
    loadRecords: vi.fn(async (sheetId: string) =>
      copy(state.records.filter((r) => r.sheet_id === sheetId).sort(byPos)),
    ),
    createWorkspace: vi.fn(async (draft: Row, position: number) => {
      const w = { ...draft, id: id('w'), owner_id: 'u1', position, created_at: now }
      state.workspaces.push(w)
      return copy(w)
    }),
    updateWorkspace: vi.fn(async (wid: string, draft: Row) => {
      const w = state.workspaces.find((x) => x.id === wid)!
      Object.assign(w, draft)
      return copy(w)
    }),
    deleteWorkspace: vi.fn(async (wid: string) => {
      state.workspaces = state.workspaces.filter((x) => x.id !== wid)
    }),
    createSheet: vi.fn(async (workspaceId: string, draft: Row, position: number) => {
      const s = {
        ...draft,
        id: id('s'),
        owner_id: 'u1',
        workspace_id: workspaceId,
        position,
        created_at: now,
      }
      state.sheets.push(s)
      return copy(s)
    }),
    updateSheet: vi.fn(async (sid: string, draft: Row) => {
      const s = state.sheets.find((x) => x.id === sid)!
      Object.assign(s, draft)
      return copy(s)
    }),
    deleteSheet: vi.fn(async (sid: string) => {
      state.sheets = state.sheets.filter((x) => x.id !== sid)
    }),
    duplicateSheet: vi.fn(async () => {
      throw new Error('not used in these tests')
    }),
    createField: vi.fn(async (sheetId: string, draft: Row, position: number, isTitle = false) => {
      const f = {
        ...draft,
        id: id('f'),
        owner_id: 'u1',
        sheet_id: sheetId,
        is_title: isTitle,
        position,
        created_at: now,
      }
      state.fields.push(f)
      return copy(f)
    }),
    updateField: vi.fn(async (fid: string, draft: Row) => {
      const f = state.fields.find((x) => x.id === fid)!
      Object.assign(f, draft)
      return copy(f)
    }),
    deleteField: vi.fn(async (fid: string) => {
      state.fields = state.fields.filter((x) => x.id !== fid)
    }),
    moveField: vi.fn(async () => []),
    setTitleField: vi.fn(async () => undefined),
    createRecord: vi.fn(async (sheetId: string, _fields: unknown, cells: Row, position: number) => {
      const r = {
        id: id('r'),
        owner_id: 'u1',
        sheet_id: sheetId,
        cells,
        done: false,
        position,
        created_at: now,
        updated_at: now,
      }
      state.records.push(r)
      return copy(r)
    }),
    updateRecord: vi.fn(async (rid: string, _fields: unknown, cells: Row) => {
      const r = state.records.find((x) => x.id === rid)!
      r.cells = cells
      return copy(r)
    }),
    moveRecord: vi.fn(async (_sheetId: string, rid: string, position: number) => {
      state.records.find((x) => x.id === rid)!.position = position
    }),
    renumberSheet: vi.fn(async () => []),
    setDone: vi.fn(async (rid: string, done: boolean) => {
      const r = state.records.find((x) => x.id === rid)!
      r.done = done
      return copy(r)
    }),
    deleteRecord: vi.fn(async (rid: string) => {
      state.records = state.records.filter((x) => x.id !== rid)
    }),
    bulkDone: vi.fn(async (ids: string[], done: boolean) => {
      const hit = state.records.filter((x) => ids.includes(x.id))
      for (const r of hit) r.done = done
      return copy(hit)
    }),
    bulkDelete: vi.fn(async (ids: string[]) => {
      state.records = state.records.filter((x) => !ids.includes(x.id))
    }),
    bulkDuplicate: vi.fn(async () => []),
    bulkSet: vi.fn(async () => []),
  }

  type Seed = { workspaces?: object[]; sheets?: object[]; fields?: object[]; records?: object[] }
  function reset(seed: Seed) {
    state.workspaces = copy(seed.workspaces ?? []) as Row[]
    state.sheets = copy(seed.sheets ?? []) as Row[]
    state.fields = copy(seed.fields ?? []) as Row[]
    state.records = copy(seed.records ?? []) as Row[]
    state.next = 100
  }

  const shareQuery = {
    select: () => shareQuery,
    eq: () => shareQuery,
    order: () => shareQuery,
    insert: () => shareQuery,
    update: () => shareQuery,
    single: () => shareQuery,
    then: (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null }),
  }

  const supabase = {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { user: { id: 'u1', email: 'me@example.com' } } },
      })),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: () => undefined } },
      })),
      signOut: vi.fn(async () => ({ error: null })),
    },
    from: vi.fn(() => shareQuery),
    rpc: vi.fn(async () => ({ data: null, error: null })),
  }

  return { api, supabase, reset, state }
})

vi.mock('./db', async () => ({
  ...(await import('./values')),
  api: backend.api,
  supabase: backend.supabase,
}))

const { default: App } = await import('./App')

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

const now = '2026-01-01T00:00:00Z'

const home: Workspace = {
  id: 'w-1',
  owner_id: 'u1',
  name: 'Home',
  description: '',
  accent: '#fe4c01',
  position: 100,
  created_at: now,
}

const books: Sheet = {
  id: 's-1',
  owner_id: 'u1',
  workspace_id: 'w-1',
  name: 'Books',
  description: '',
  accent: '#6d5efc',
  done_label: 'Done',
  position: 100,
  created_at: now,
}

const nameField: Field = {
  id: 'f-1',
  owner_id: 'u1',
  sheet_id: 's-1',
  key: 'name',
  name: 'Name',
  type: 'text',
  options: [],
  required: true,
  is_title: true,
  position: 10,
  created_at: now,
}

function row(id: string, name: string, position: number): Record_ {
  return {
    id,
    owner_id: 'u1',
    sheet_id: 's-1',
    cells: { name },
    done: false,
    position,
    created_at: now,
    updated_at: now,
  }
}

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function openBooks() {
  render(<App />)
  fireEvent.click(await screen.findByText('Books'))
  await waitFor(() => expect(backend.api.loadRecords).toHaveBeenCalledWith('s-1'))
}

function bodyRowNames() {
  return within(screen.getByRole('table'))
    .getAllByRole('row')
    .slice(1)
    .map((tr) => within(tr).getAllByRole('cell')[3].textContent)
}

// dnd-kit measures rows with getBoundingClientRect; jsdom returns zeros, so give each body row a 40px slot.
function layOutRows() {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const tr = this.closest('tbody tr')
    const i = tr ? Array.from(tr.parentElement!.children).indexOf(tr) : 0
    const top = tr ? 40 + i * 40 : 0
    return {
      x: 0,
      y: top,
      top,
      left: 0,
      width: 600,
      height: tr ? 40 : 0,
      bottom: top + (tr ? 40 : 0),
      right: 600,
      toJSON: () => ({}),
    } as DOMRect
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// behaviour
// ---------------------------------------------------------------------------

describe('App (characterisation)', () => {
  it('creates a workspace', async () => {
    backend.reset({})
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Create your first workspace' }))
    await user.type(screen.getByLabelText('Name'), 'Work')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(backend.api.createWorkspace).toHaveBeenCalledWith(
      { name: 'Work', description: '', accent: '#fe4c01' },
      100,
    )
    expect(await screen.findByText('Created "Work"')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Work' })).toBeInTheDocument()
    expect(screen.getByText('No sheets yet')).toBeInTheDocument()
  })

  it('creates a sheet with a default Name column and opens the column manager', async () => {
    backend.reset({ workspaces: [home] })
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Create your first sheet' }))
    await user.type(screen.getByPlaceholderText('Reading list'), 'Novels')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(backend.api.createSheet).toHaveBeenCalledWith(
      'w-1',
      { name: 'Novels', description: '', accent: '#fe4c01', done_label: 'Done' },
      100,
    )
    const sheetId = backend.state.sheets[0].id
    expect(backend.api.createField).toHaveBeenCalledWith(
      sheetId,
      { key: 'name', name: 'Name', type: 'text', options: [], required: true },
      10,
      true,
    )
    const manager = await screen.findByRole('dialog')
    expect(within(manager).getByRole('heading', { name: 'Columns — Novels' })).toBeInTheDocument()
    expect(within(manager).getByText('Name')).toBeInTheDocument()
    expect(backend.api.loadRecords).not.toHaveBeenCalled()
  })

  it('adds, edits and deletes a row', async () => {
    backend.reset({ workspaces: [home], sheets: [books], fields: [nameField] })
    const user = userEvent.setup()
    await openBooks()

    await user.click((await screen.findAllByRole('button', { name: '+ Add row' }))[0])
    await user.type(within(screen.getByRole('dialog')).getByRole('textbox'), 'Dune')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(backend.api.createRecord).toHaveBeenCalledWith(
      's-1',
      [expect.objectContaining({ id: 'f-1' })],
      { name: 'Dune' },
      1000,
    )
    expect(await screen.findByText('Row added')).toBeInTheDocument()
    expect(bodyRowNames()).toEqual(['Dune'])
    const rid = backend.state.records[0].id

    await user.click(screen.getByRole('button', { name: 'Edit row 1' }))
    const box = within(screen.getByRole('dialog', {})).getByRole('textbox')
    expect(box).toHaveValue('Dune')
    await user.clear(box)
    await user.type(box, 'Emma')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(backend.api.updateRecord).toHaveBeenCalledWith(
      rid,
      [expect.objectContaining({ id: 'f-1' })],
      { name: 'Emma' },
    )
    await waitFor(() => expect(bodyRowNames()).toEqual(['Emma']))

    await user.click(screen.getByRole('button', { name: 'Delete row 1' }))
    expect(window.confirm).toHaveBeenCalledWith('Delete "Emma"? This cannot be undone.')
    expect(backend.api.deleteRecord).toHaveBeenCalledWith(rid)
    expect(await screen.findByText('No rows yet.')).toBeInTheDocument()
    expect(screen.getByText('Deleted')).toBeInTheDocument()
  })

  it('toggles done optimistically and rolls back when the save fails', async () => {
    backend.reset({
      workspaces: [home],
      sheets: [books],
      fields: [nameField],
      records: [row('r-1', 'Dune', 1000)],
    })
    const user = userEvent.setup()
    await openBooks()

    const box = await screen.findByRole('checkbox', { name: 'Done: row 1' })
    const pending = deferred<never>()
    backend.api.setDone.mockImplementationOnce(() => pending.promise)

    await user.click(box)
    expect(box).toBeChecked()
    expect(backend.api.setDone).toHaveBeenCalledWith('r-1', true)

    await act(async () => pending.reject(new Error('Could not update row: offline')))
    await waitFor(() => expect(box).not.toBeChecked())
    expect(screen.getByText('Could not update row: offline')).toBeInTheDocument()

    await user.click(box)
    await waitFor(() => expect(box).toBeChecked())
    expect(backend.state.records[0].done).toBe(true)
    expect(screen.queryByText('Could not update row: offline')).not.toBeInTheDocument()
  })

  it('deletes selected rows as a group', async () => {
    backend.reset({
      workspaces: [home],
      sheets: [books],
      fields: [nameField],
      records: [row('r-1', 'A', 1000), row('r-2', 'B', 2000), row('r-3', 'C', 3000)],
    })
    const user = userEvent.setup()
    await openBooks()

    await user.click(await screen.findByRole('checkbox', { name: 'Select row 1' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select row 3' }))
    expect(screen.getByText('2 selected')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Delete 2' }))
    expect(window.confirm).toHaveBeenCalledWith('Delete 2 rows? This cannot be undone.')
    expect(backend.api.bulkDelete).toHaveBeenCalledWith(['r-1', 'r-3'])
    expect(await screen.findByText('Rows deleted')).toBeInTheDocument()
    expect(bodyRowNames()).toEqual(['B'])
    expect(screen.queryByText(/selected$/)).not.toBeInTheDocument()
  })

  it('reorders a row with one moveRecord call', async () => {
    backend.reset({
      workspaces: [home],
      sheets: [books],
      fields: [nameField],
      records: [row('r-1', 'A', 1000), row('r-2', 'B', 2000), row('r-3', 'C', 3000)],
    })
    layOutRows()
    await openBooks()

    const handle = await screen.findByRole('button', { name: 'Move row 1' })
    handle.focus()
    fireEvent.keyDown(handle, { code: 'Space', key: ' ' })
    await act(async () => undefined)
    fireEvent.keyDown(document.activeElement ?? handle, { code: 'ArrowDown', key: 'ArrowDown' })
    await act(async () => undefined)
    fireEvent.keyDown(document.activeElement ?? handle, { code: 'Space', key: ' ' })

    await waitFor(() => expect(backend.api.moveRecord).toHaveBeenCalledTimes(1))
    expect(backend.api.moveRecord).toHaveBeenCalledWith('s-1', 'r-1', 2500)
    await waitFor(() => expect(bodyRowNames()).toEqual(['B', 'A', 'C']))
  })

  it('opens the share modal for a sheet and for a workspace', async () => {
    backend.reset({ workspaces: [home], sheets: [books], fields: [nameField] })
    const user = userEvent.setup()
    await openBooks()

    await user.click(await screen.findByRole('button', { name: 'Share' }))
    expect(await screen.findByText(/Anyone with the link can view this/)).toBeInTheDocument()
    expect(backend.supabase.from).toHaveBeenCalledWith('shares')
    await user.keyboard('{Escape}')
    expect(screen.queryByText(/Anyone with the link can view this/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '‹ Home' }))
    await user.click(await screen.findByRole('button', { name: 'Share' }))
    expect(await screen.findByText(/Anyone with the link can view this/)).toBeInTheDocument()
  })
})
