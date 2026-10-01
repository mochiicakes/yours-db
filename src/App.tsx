import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  api,
  rowSearchText,
  rowTitle,
  supabase,
  type Cells,
  type Field,
  type FieldDraft,
  type Profile,
  type Record_,
  type Sheet,
  type SheetCount,
  type SheetDraft,
  type Workspace,
} from './db'
import { applyTheme, savedAccent, savedTheme, type Theme } from './theme'
import { SheetView } from './features/rows/SheetView'
import { Onboarding } from './features/auth/Onboarding'
import { Brand } from './components/Brand'
import { ForgotPassword, SetNewPassword } from './features/auth/ResetPassword'
import { UserMenu } from './features/settings/UserMenu'
import { Auth } from './features/auth/Auth'
import { SharedView } from './features/sharing/SharedView'
import { shareTokenFromUrl } from './features/sharing/sharedPayload'
import { ShareModal } from './features/sharing/ShareModal'
import { Sidebar } from './features/workspaces/Sidebar'
import { SheetList } from './features/sheets/SheetList'
import { ColumnManager } from './features/columns/ColumnManager'
import { ProfileModal } from './features/settings/ProfileModal'
import { RowEditor } from './features/rows/RowEditor'
import { SheetEditor } from './features/sheets/SheetEditor'
import { SupportModal } from './features/settings/SupportModal'
import { ThemePicker } from './features/settings/ThemePicker'
import { WorkspaceEditor } from './features/workspaces/WorkspaceEditor'
import { nextPosition, nextPositions, planMove } from './reorder'

// ---------------------------------------------------------------------------
// root
// ---------------------------------------------------------------------------

export default function App() {
  const [shareToken] = useState<string | null>(() => shareTokenFromUrl())
  const [session, setSession] = useState<Session | null>(null)
  const [checking, setChecking] = useState(true)
  const [reset, setReset] = useState<'none' | 'asking' | 'recovery'>('none')
  const [theme, setTheme] = useState<Theme>(() => savedTheme())
  const [accent, setAccent] = useState<string>(() => savedAccent())

  useEffect(() => {
    applyTheme(theme, accent)
  }, [theme, accent])

  useEffect(() => {
    const safeAccent = /^#[0-9a-f]{6}$/i.test(accent) ? accent : '#8b5cf6'

    const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <circle cx="32" cy="32" r="26" fill="${safeAccent}" />
  </svg>
  `

    let favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')

    if (!favicon) {
      favicon = document.createElement('link')
      favicon.rel = 'icon'
      favicon.type = 'image/svg+xml'
      document.head.appendChild(favicon)
    }

    favicon.href = `data:image/svg+xml,${encodeURIComponent(svg)}`
  }, [accent])

  useEffect(() => {
    if (window.location.hash.includes('type=recovery')) setReset('recovery')

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setChecking(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next)
      if (event === 'PASSWORD_RECOVERY') setReset('recovery')
      if (event === 'SIGNED_OUT') setReset('none')
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  if (shareToken) return <SharedView token={shareToken} />
  if (checking) return <div className="booting">Loading…</div>
  if (reset === 'recovery' && session) {
    return (
      <SetNewPassword
        email={session.user.email ?? ''}
        onDone={() => {
          // Clear the recovery fragment so a refresh does not reopen the form.
          window.history.replaceState(null, '', window.location.pathname)
          setReset('none')
        }}
        onCancel={() => {
          void supabase.auth.signOut()
          window.history.replaceState(null, '', window.location.pathname)
          setReset('none')
        }}
      />
    )
  }

  if (!session) {
    if (reset === 'asking') return <ForgotPassword onBack={() => setReset('none')} />
    return <Auth onForgot={() => setReset('asking')} />
  }

  return (
    <Gate
      email={session.user.email ?? ''}
      theme={theme}
      accent={accent}
      onTheme={setTheme}
      onAccent={setAccent}
    />
  )
}

// Waits for the profile so the database name is never briefly wrong.
function Gate({
  email,
  theme,
  accent,
  onTheme,
  onAccent,
}: {
  email: string
  theme: Theme
  accent: string
  onTheme: (t: Theme) => void
  onAccent: (hex: string) => void
}) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void api
      .loadProfile()
      .then((p) => alive && setProfile(p))
      .catch((e) => alive && setProblem((e as Error).message))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  async function finishOnboarding(name: string) {
    setBusy(true)
    try {
      setProfile(await api.saveProfile(name))
      setProblem(null)
    } catch (e) {
      setProblem((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function renameDatabase(name: string) {
    try {
      setProfile(await api.saveProfile(name))
      return true
    } catch (e) {
      setProblem((e as Error).message)
      return false
    }
  }

  if (loading) return <div className="booting">Loading…</div>

  if (problem && !profile) {
    return (
      <div className="onboard">
        <div className="onboardcard">
          <div className="alert">
            <b>{problem}</b>
            <br />
            If this mentions a missing table, the database migrations have not been applied yet.
          </div>
          <button className="primary wide" onClick={() => window.location.reload()}>
            Try again
          </button>
        </div>
      </div>
    )
  }

  if (!profile?.onboarded) {
    return (
      <Onboarding
        email={email}
        theme={theme}
        accent={accent}
        busy={busy}
        onTheme={onTheme}
        onAccent={onAccent}
        onFinish={(name) => void finishOnboarding(name)}
      />
    )
  }

  return (
    <Home
      email={email}
      profile={profile}
      dbName={profile.db_name}
      theme={theme}
      accent={accent}
      onTheme={onTheme}
      onAccent={onAccent}
      onRenameDatabase={renameDatabase}
    />
  )
}

// ---------------------------------------------------------------------------
// signed in
// ---------------------------------------------------------------------------

type ShareTarget = { scope: 'sheet' | 'workspace'; id: string; name: string }

function Home({
  email,
  profile,
  dbName,
  theme,
  accent,
  onTheme,
  onAccent,
  onRenameDatabase,
}: {
  email: string
  profile: Profile
  dbName: string
  theme: Theme
  accent: string
  onTheme: (t: Theme) => void
  onAccent: (hex: string) => void
  onRenameDatabase: (name: string) => Promise<boolean>
}) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [sheets, setSheets] = useState<Sheet[]>([])
  const [fields, setFields] = useState<Field[]>([])
  // Rows load per sheet when opened. serverCounts covers unloaded sheets; countsKnown is false if sheet_counts failed.
  const [records, setRecords] = useState<Record_[]>([])
  const [loadedSheets, setLoadedSheets] = useState<Set<string>>(new Set())
  const [serverCounts, setServerCounts] = useState<Map<string, SheetCount>>(new Map())
  const [countsKnown, setCountsKnown] = useState(true)
  const [countsWarning, setCountsWarning] = useState<string | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const loadingSheets = useRef<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [sheetId, setSheetId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const [rowModal, setRowModal] = useState<{ editing: Record_ | null } | null>(null)
  const [sheetModal, setSheetModal] = useState<{ editing: Sheet | null } | null>(null)
  const [columnsOpen, setColumnsOpen] = useState(false)
  const [themeOpen, setThemeOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [supportOpen, setSupportOpen] = useState(false)
  const [wsModal, setWsModal] = useState<{ editing: Workspace | null } | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [shareModal, setShareModal] = useState<ShareTarget | null>(null)
  const [toast, setToast] = useState('')
  const toastTimer = useRef<number>()

  const say = useCallback((message: string) => {
    setToast(message)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 2600)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const all = await api.loadAll()
      setWorkspaces(all.workspaces)
      setSheets(all.sheets)
      setFields(all.fields)
      setServerCounts(new Map((all.counts ?? []).map((c) => [c.sheet_id, c])))
      setCountsKnown(all.counts !== null)
      setCountsWarning(all.countsError)
      // Drop cached rows; the open sheet reloads through the effect below.
      setRecords([])
      setLoadedSheets(new Set())
      loadingSheets.current = new Set()
      setLoadFailed(false)
      setError(null)
    } catch (e) {
      setLoadFailed(true)
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const markLoaded = useCallback((id: string) => {
    setLoadedSheets((prev) => new Set(prev).add(id))
  }, [])

  useEffect(() => {
    if (!sheetId || loadedSheets.has(sheetId) || loadingSheets.current.has(sheetId)) return
    const id = sheetId
    loadingSheets.current.add(id)
    api.loadRecords(id).then(
      (rows) => {
        if (!loadingSheets.current.has(id)) return
        loadingSheets.current.delete(id)
        setRecords((prev) => [...prev.filter((r) => r.sheet_id !== id), ...rows])
        markLoaded(id)
      },
      (e: Error) => {
        loadingSheets.current.delete(id)
        setError(e.message)
      },
    )
  }, [sheetId, loadedSheets, markLoaded])

  async function run<T>(work: () => Promise<T>, fallback: T): Promise<T> {
    setBusy(true)
    try {
      const result = await work()
      setError(null)
      return result
    } catch (e) {
      setError((e as Error).message)
      return fallback
    } finally {
      setBusy(false)
    }
  }

  const openWorkspace = workspaces.find((w) => w.id === workspaceId) ?? null
  const workspaceSheets = useMemo(
    () =>
      sheets.filter((s) => s.workspace_id === workspaceId).sort((a, b) => a.position - b.position),
    [sheets, workspaceId],
  )

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

  const rows = useMemo(() => {
    let list = records.filter((r) => r.sheet_id === sheetId).sort((a, b) => a.position - b.position)
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter((r) => rowSearchText(sheetFields, r).includes(q))
    }
    return list
  }, [records, sheetId, query, sheetFields])

  // Loaded sheets count rows in memory so edits show at once. Unknown counts stay missing and show as "– rows".
  const counts = useMemo(() => {
    const map = new Map<string, number>()
    if (countsKnown) for (const s of sheets) map.set(s.id, 0)
    for (const [id, c] of serverCounts) if (!loadedSheets.has(id)) map.set(id, c.total)
    for (const id of loadedSheets) map.set(id, 0)
    for (const r of records) map.set(r.sheet_id, (map.get(r.sheet_id) ?? 0) + 1)
    return map
  }, [records, serverCounts, loadedSheets, countsKnown, sheets])

  const sheetsPerWorkspace = useMemo(() => {
    const map = new Map<string, number>()
    for (const s of sheets) map.set(s.workspace_id, (map.get(s.workspace_id) ?? 0) + 1)
    return map
  }, [sheets])

  const donePerSheet = useMemo(() => {
    const map = new Map<string, number>()
    for (const [id, c] of serverCounts) if (!loadedSheets.has(id)) map.set(id, c.done)
    for (const r of records) {
      if (r.done) map.set(r.sheet_id, (map.get(r.sheet_id) ?? 0) + 1)
    }
    return map
  }, [records, serverCounts, loadedSheets])

  const totalRows = useMemo(() => [...counts.values()].reduce((a, b) => a + b, 0), [counts])
  const sheetRowsLoaded = !!sheetId && loadedSheets.has(sheetId)

  const doneCount = rows.filter((r) => r.done).length
  const chosenIds = useMemo(
    () => rows.filter((r) => selected.has(r.id)).map((r) => r.id),
    [rows, selected],
  )

  // -------------------------------------------------------------------------
  // workspaces
  // -------------------------------------------------------------------------

  async function saveWorkspace(draft: {
    name: string
    description: string
    accent: string
  }): Promise<boolean> {
    if (wsModal?.editing) {
      const saved = await run(() => api.updateWorkspace(wsModal.editing!.id, draft), null)
      if (!saved) return false
      setWorkspaces((prev) => prev.map((w) => (w.id === saved.id ? saved : w)))
      say('Saved')
      return true
    }
    const position = workspaces.reduce((m, w) => Math.max(m, w.position), 0) + 100
    const created = await run(() => api.createWorkspace(draft, position), null)
    if (!created) return false
    setWorkspaces((prev) => [...prev, created])
    setWorkspaceId(created.id)
    say(`Created "${created.name}"`)
    return true
  }

  async function deleteWorkspace(): Promise<boolean> {
    const target = wsModal?.editing
    if (!target) return false
    const ok = await run(async () => {
      await api.deleteWorkspace(target.id)
      return true
    }, false)
    if (!ok) return false
    const goneSheets = new Set(sheets.filter((s) => s.workspace_id === target.id).map((s) => s.id))
    setWorkspaces((prev) => prev.filter((w) => w.id !== target.id))
    setSheets((prev) => prev.filter((s) => s.workspace_id !== target.id))
    setFields((prev) => prev.filter((f) => !goneSheets.has(f.sheet_id)))
    setRecords((prev) => prev.filter((r) => !goneSheets.has(r.sheet_id)))
    if (workspaceId === target.id) setWorkspaceId(null)
    say('Workspace deleted')
    return true
  }

  // -------------------------------------------------------------------------
  // sheets
  // -------------------------------------------------------------------------

  async function saveSheet(draft: SheetDraft): Promise<boolean> {
    if (sheetModal?.editing) {
      const saved = await run(() => api.updateSheet(sheetModal.editing!.id, draft), null)
      if (!saved) return false
      setSheets((prev) => prev.map((s) => (s.id === saved.id ? saved : s)))
      say('Saved')
      return true
    }

    if (!openWorkspace) return false
    const position = workspaceSheets.reduce((m, s) => Math.max(m, s.position), 0) + 100
    const created = await run(() => api.createSheet(openWorkspace.id, draft, position), null)
    if (!created) return false

    // A sheet with no columns cannot hold anything, so give it one immediately.
    const first = await run(
      () =>
        api.createField(
          created.id,
          { key: 'name', name: 'Name', type: 'text', options: [], required: true },
          10,
          true,
        ),
      null,
    )

    setSheets((prev) => [...prev, created])
    if (first) setFields((prev) => [...prev, first])
    markLoaded(created.id)
    setSheetId(created.id)
    say(`Created "${created.name}"`)
    setColumnsOpen(true)
    return true
  }

  async function deleteSheet(): Promise<boolean> {
    const target = sheetModal?.editing
    if (!target) return false
    const ok = await run(async () => {
      await api.deleteSheet(target.id)
      return true
    }, false)
    if (!ok) return false
    setSheets((prev) => prev.filter((s) => s.id !== target.id))
    setFields((prev) => prev.filter((f) => f.sheet_id !== target.id))
    setRecords((prev) => prev.filter((r) => r.sheet_id !== target.id))
    say('Sheet deleted')
    return true
  }

  // -------------------------------------------------------------------------
  // columns
  // -------------------------------------------------------------------------

  async function addColumn(draft: FieldDraft): Promise<boolean> {
    if (!sheet) return false
    const position = sheetFields.reduce((m, f) => Math.max(m, f.position), 0) + 10
    const created = await run(
      () => api.createField(sheet.id, draft, position, sheetFields.length === 0),
      null,
    )
    if (!created) return false
    setFields((prev) => [...prev, created])
    say(`Added "${created.name}"`)
    return true
  }

  async function editColumn(id: string, draft: FieldDraft): Promise<boolean> {
    const saved = await run(() => api.updateField(id, draft), null)
    if (!saved) return false
    setFields((prev) => prev.map((f) => (f.id === id ? saved : f)))
    say('Column saved')
    return true
  }

  async function deleteColumn(id: string): Promise<boolean> {
    const target = fields.find((f) => f.id === id)
    const ok = await run(async () => {
      await api.deleteField(id)
      return true
    }, false)
    if (!ok) return false
    setFields((prev) => prev.filter((f) => f.id !== id))
    // Mirror the database trigger that strips this column from every row.
    if (target) {
      setRecords((prev) =>
        prev.map((r) => {
          if (r.sheet_id !== target.sheet_id || !(target.key in r.cells)) return r
          const cells = { ...r.cells }
          delete cells[target.key]
          return { ...r, cells }
        }),
      )
    }
    say('Column deleted')
    return true
  }

  async function moveColumn(index: number, by: -1 | 1) {
    const to = index + by
    if (to < 0 || to >= sheetFields.length) return
    const a = sheetFields[index]
    const b = sheetFields[to]
    // One write; the server respaces the columns. A collapsed gap from older data is respaced first.
    const ok = await run(async () => {
      let list = sheetFields
      let plan = planMove(list, a.id, b.id)
      if (plan?.kind === 'renumber') {
        const spaced = new Map(
          (await api.moveField(a.id, a.position)).map((p) => [p.id, p.position]),
        )
        list = list.map((f) => ({ ...f, position: spaced.get(f.id) ?? f.position }))
        plan = planMove(list, a.id, b.id)
      }
      if (plan?.kind !== 'one') return false
      const position = plan.position
      setFields((prev) => prev.map((f) => (f.id === a.id ? { ...f, position } : f)))
      const spaced = new Map((await api.moveField(a.id, position)).map((p) => [p.id, p.position]))
      setFields((prev) =>
        prev.map((f) => (spaced.has(f.id) ? { ...f, position: spaced.get(f.id)! } : f)),
      )
      return true
    }, false)
    if (!ok) void load()
  }

  async function makeTitle(id: string) {
    if (!sheet) return
    const ok = await run(async () => {
      await api.setTitleField(sheet.id, id)
      return true
    }, false)
    if (!ok) return
    setFields((prev) =>
      prev.map((f) => (f.sheet_id === sheet.id ? { ...f, is_title: f.id === id } : f)),
    )
  }

  async function deleteSheetDirect(target: Sheet): Promise<void> {
    if (
      !window.confirm(
        `Delete "${target.name}", its columns and every row in it? This cannot be undone.`,
      )
    ) {
      return
    }
    const ok = await run(async () => {
      await api.deleteSheet(target.id)
      return true
    }, false)
    if (!ok) return
    setSheets((prev) => prev.filter((s) => s.id !== target.id))
    setFields((prev) => prev.filter((f) => f.sheet_id !== target.id))
    setRecords((prev) => prev.filter((r) => r.sheet_id !== target.id))
    if (sheetId === target.id) setSheetId(null)
    say('Sheet deleted')
  }

  async function duplicateSheet(target: Sheet, includeContents: boolean) {
    const duplicated = await run(() => api.duplicateSheet(target.id, includeContents), null)

    if (!duplicated) return

    setSheets((previous) => [...previous, duplicated.sheet])
    setFields((previous) => [...previous, ...duplicated.fields])
    setRecords((previous) => [...previous, ...duplicated.records])
    markLoaded(duplicated.sheet.id)

    say(
      includeContents
        ? `Duplicated "${target.name}" with its contents`
        : `Duplicated "${target.name}" without contents`,
    )
  }

  // -------------------------------------------------------------------------
  // rows
  // -------------------------------------------------------------------------

  async function saveRow(cells: Cells): Promise<boolean> {
    if (!sheet) return false
    if (rowModal?.editing) {
      const saved = await run(
        () => api.updateRecord(rowModal.editing!.id, sheetFields, cells),
        null,
      )
      if (!saved) return false
      setRecords((prev) => prev.map((r) => (r.id === saved.id ? saved : r)))
      say('Saved')
      return true
    }
    const position = nextPosition(records.filter((r) => r.sheet_id === sheet.id))
    const created = await run(() => api.createRecord(sheet.id, sheetFields, cells, position), null)
    if (!created) return false
    setRecords((prev) => [...prev, created])
    say('Row added')
    return true
  }

  async function toggleDone(row: Record_) {
    const before = records
    setRecords((prev) => prev.map((r) => (r.id === row.id ? { ...r, done: !row.done } : r)))
    const saved = await run(() => api.setDone(row.id, !row.done), null)
    if (!saved) setRecords(before)
    else setRecords((prev) => prev.map((r) => (r.id === saved.id ? saved : r)))
  }

  async function deleteRow(row: Record_) {
    if (!window.confirm(`Delete "${rowTitle(sheetFields, row)}"? This cannot be undone.`)) return
    const before = records
    setRecords((prev) => prev.filter((r) => r.id !== row.id))
    const ok = await run(async () => {
      await api.deleteRecord(row.id)
      return true
    }, false)
    if (!ok) setRecords(before)
    else say('Deleted')
  }

  async function moveRow(activeId: string, overId: string) {
    if (!sheet || query.trim()) return
    let sorted = records
      .filter((r) => r.sheet_id === sheet.id)
      .sort((a, b) => a.position - b.position)
    let plan = planMove(sorted, activeId, overId)
    if (!plan) return

    const ok = await run(async () => {
      if (plan!.kind === 'renumber') {
        const pos = new Map((await api.renumberSheet(sheet.id)).map((r) => [r.id, r.position]))
        sorted = sorted
          .map((r) => ({ ...r, position: pos.get(r.id) ?? r.position }))
          .sort((a, b) => a.position - b.position)
        setRecords((prev) =>
          prev.map((r) => (pos.has(r.id) ? { ...r, position: pos.get(r.id)! } : r)),
        )
        plan = planMove(sorted, activeId, overId)
      }
      if (plan?.kind !== 'one') return true
      const { position } = plan
      setRecords((prev) => prev.map((r) => (r.id === activeId ? { ...r, position } : r)))
      await api.moveRecord(sheet.id, activeId, position)
      return true
    }, false)
    if (!ok) void load()
  }

  // -------------------------------------------------------------------------
  // group actions
  // -------------------------------------------------------------------------

  async function groupDone(done: boolean) {
    const before = records
    const ids = new Set(chosenIds)
    setRecords((prev) => prev.map((r) => (ids.has(r.id) ? { ...r, done } : r)))
    const saved = await run(() => api.bulkDone(chosenIds, done), null)
    if (!saved) {
      setRecords(before)
      return
    }
    const byId = new Map(saved.map((r) => [r.id, r]))
    setRecords((prev) => prev.map((r) => byId.get(r.id) ?? r))
    say(`${chosenIds.length} rows updated`)
  }

  async function groupDelete() {
    if (!window.confirm(`Delete ${chosenIds.length} rows? This cannot be undone.`)) return
    const before = records
    const ids = new Set(chosenIds)
    setRecords((prev) => prev.filter((r) => !ids.has(r.id)))
    const ok = await run(async () => {
      await api.bulkDelete(chosenIds)
      return true
    }, false)
    if (!ok) {
      setRecords(before)
      return
    }
    setSelected(new Set())
    say('Rows deleted')
  }

  async function groupDuplicate() {
    if (!sheet) return
    const chosen = records.filter((r) => chosenIds.includes(r.id))
    const positions = nextPositions(
      records.filter((r) => r.sheet_id === sheet.id),
      chosen.length,
    )
    const created = await run(() => api.bulkDuplicate(chosen, positions), null)
    if (!created) return
    setRecords((prev) => [...prev, ...created])
    setSelected(new Set())
    say(`Duplicated ${created.length} rows`)
  }

  async function groupSet(key: string, value: string) {
    const saved = await run(() => api.bulkSet(chosenIds, sheetFields, key, value), null)
    if (!saved) return
    const byId = new Map(saved.map((r) => [r.id, r]))
    setRecords((prev) => prev.map((r) => byId.get(r.id) ?? r))
    say(`${saved.length} rows updated`)
  }

  // -------------------------------------------------------------------------

  return (
    <div className={`app${collapsed ? ' railed' : ''}`}>
      <header className="topbar">
        <div className="brandrow">
          <button className="brandbtn" onClick={() => setSheetId(null)} aria-label="Back to sheets">
            <Brand name={dbName} />
          </button>
          <UserMenu
            email={email}
            onProfile={() => setProfileOpen(true)}
            onSettings={() => setThemeOpen(true)}
            onSupport={() => setSupportOpen(true)}
            onSignOut={() => void supabase.auth.signOut()}
          />
        </div>
      </header>

      <div className="body">
        <main className="main">
          {error && (
            <div className="alert">
              <b>{error}</b>
              <br />
              Nothing was lost. Try again, or reload the page.
            </div>
          )}

          {countsWarning && !error && (
            <div className="alert">
              <b>Row counts are unavailable: {countsWarning}</b>
              <br />
              Your data is fine. Open a sheet to see its rows.
            </div>
          )}

          {loading ? (
            <div className="booting">Loading…</div>
          ) : loadFailed ? null : !workspaces.length ? (
            <div className="hollow big">
              <h2>Nothing here yet</h2>
              <p>What's your first Workspace about?</p>
              <button
                className="primary"
                disabled={busy}
                onClick={() => setWsModal({ editing: null })}
              >
                Create your first workspace
              </button>
            </div>
          ) : !openWorkspace ? (
            <div className="hollow big">Pick a workspace from the sidebar.</div>
          ) : !sheet ? (
            <SheetList
              workspace={openWorkspace}
              sheets={workspaceSheets}
              rowCounts={counts}
              doneCounts={donePerSheet}
              busy={busy}
              onOpen={setSheetId}
              onNew={() => setSheetModal({ editing: null })}
              onShare={() =>
                setShareModal({
                  scope: 'workspace',
                  id: openWorkspace.id,
                  name: openWorkspace.name,
                })
              }
              onEdit={(s) => setSheetModal({ editing: s })}
              onDelete={(s) => void deleteSheetDirect(s)}
              onDuplicate={(sheet, includeContents) => void duplicateSheet(sheet, includeContents)}
            />
          ) : (
            <>
              <div className="sheethead">
                <div>
                  <button className="backlink" onClick={() => setSheetId(null)}>
                    ‹ {openWorkspace.name}
                  </button>
                  <h1>{sheet.name}</h1>
                  {sheet.description && <p className="desc">{sheet.description}</p>}
                </div>
                <div className="sheettools">
                  <button
                    onClick={() =>
                      setShareModal({ scope: 'sheet', id: sheet.id, name: sheet.name })
                    }
                  >
                    Share
                  </button>
                  <button onClick={() => setColumnsOpen(true)}>Columns</button>
                  <button onClick={() => setSheetModal({ editing: sheet })}>Settings</button>
                </div>
              </div>

              <div className="toolbar">
                <input
                  type="search"
                  placeholder="Search every column…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <button
                  className="primary"
                  disabled={!sheetFields.length}
                  title={sheetFields.length ? undefined : 'Add a column first'}
                  onClick={() => setRowModal({ editing: null })}
                >
                  + Add row
                </button>
                <span className="tally">
                  {!sheetRowsLoaded
                    ? '…'
                    : `${rows.length} ${rows.length === 1 ? 'row' : 'rows'}${
                        doneCount > 0 ? ` · ${doneCount} ${sheet.done_label.toLowerCase()}` : ''
                      }`}
                </span>
              </div>

              {!sheetRowsLoaded ? (
                <div className="booting">Loading rows…</div>
              ) : (
                <SheetView
                  sheet={sheet}
                  fields={sheetFields}
                  rows={rows}
                  onMoveRow={(activeId, overId) => void moveRow(activeId, overId)}
                  canReorder={!query.trim()}
                  accent={accent}
                  busy={busy}
                  selected={selected}
                  onSelect={setSelected}
                  onToggleDone={(r) => void toggleDone(r)}
                  onEdit={(r) => setRowModal({ editing: r })}
                  onDelete={(r) => void deleteRow(r)}
                  onAdd={() => setRowModal({ editing: null })}
                  onColumns={() => setColumnsOpen(true)}
                  onGroupDone={(done) => void groupDone(done)}
                  onGroupDuplicate={() => void groupDuplicate()}
                  onGroupDelete={() => void groupDelete()}
                  onGroupSet={(k, v) => void groupSet(k, v)}
                />
              )}
            </>
          )}
        </main>

        <Sidebar
          workspaces={workspaces}
          activeId={workspaceId}
          counts={sheetsPerWorkspace}
          collapsed={collapsed}
          busy={busy}
          onToggle={() => setCollapsed((v) => !v)}
          onSelect={(id) => {
            setWorkspaceId(id)
            setSheetId(null)
          }}
          onNew={() => setWsModal({ editing: null })}
          onEdit={(w) => setWsModal({ editing: w })}
        />
      </div>

      {rowModal && sheet && (
        <RowEditor
          fields={sheetFields}
          editing={rowModal.editing}
          accent={accent}
          busy={busy}
          onClose={() => setRowModal(null)}
          onSave={saveRow}
        />
      )}

      {sheetModal && (
        <SheetEditor
          editing={sheetModal.editing}
          busy={busy}
          onClose={() => setSheetModal(null)}
          onSave={saveSheet}
          onDelete={sheetModal.editing ? deleteSheet : null}
        />
      )}

      {wsModal && (
        <WorkspaceEditor
          editing={wsModal.editing}
          busy={busy}
          onClose={() => setWsModal(null)}
          onSave={saveWorkspace}
          onDelete={wsModal.editing ? deleteWorkspace : null}
        />
      )}

      {columnsOpen && sheet && (
        <ColumnManager
          sheetName={sheet.name}
          fields={sheetFields}
          busy={busy}
          onClose={() => setColumnsOpen(false)}
          onAdd={addColumn}
          onEdit={editColumn}
          onDelete={deleteColumn}
          onMove={(i, by) => void moveColumn(i, by)}
          onMakeTitle={(id) => void makeTitle(id)}
        />
      )}

      {themeOpen && (
        <ThemePicker
          dbName={dbName}
          theme={theme}
          accent={accent}
          onTheme={onTheme}
          onAccent={onAccent}
          onRename={onRenameDatabase}
          onClose={() => setThemeOpen(false)}
        />
      )}

      {profileOpen && (
        <ProfileModal
          email={email}
          dbName={dbName}
          since={profile.created_at}
          workspaces={workspaces.length}
          sheets={sheets.length}
          rows={totalRows}
          onClose={() => setProfileOpen(false)}
        />
      )}

      {supportOpen && <SupportModal onClose={() => setSupportOpen(false)} />}
      {shareModal && (
        <ShareModal
          scope={shareModal.scope}
          targetId={shareModal.id}
          targetName={shareModal.name}
          sheetIds={
            shareModal.scope === 'workspace'
              ? sheets.filter((s) => s.workspace_id === shareModal.id).map((s) => s.id)
              : []
          }
          onClose={() => setShareModal(null)}
        />
      )}
      <div className={`toast${toast ? ' show' : ''}`}>{toast}</div>
    </div>
  )
}
