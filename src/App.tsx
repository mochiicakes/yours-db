import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, type Profile, type Sheet, type Workspace } from './db'
import type { Theme } from './theme'
import { FeedbackProvider, useFeedback } from './app/feedback'
import { QueryProvider } from './app/QueryProvider'
import { useBusy, useReload } from './app/cache'
import { Brand } from './components/Brand'
import { Auth } from './features/auth/Auth'
import { Gate } from './features/auth/Gate'
import { ForgotPassword, SetNewPassword } from './features/auth/ResetPassword'
import { ColumnManager } from './features/columns/ColumnManager'
import { useColumnActions, useFields } from './features/columns/useFields'
import { ProfileModal } from './features/settings/ProfileModal'
import { SupportModal } from './features/settings/SupportModal'
import { ThemePicker } from './features/settings/ThemePicker'
import { UserMenu } from './features/settings/UserMenu'
import { useAppearance } from './features/settings/useAppearance'
import { ShareModal } from './features/sharing/ShareModal'
import { SharedView } from './features/sharing/SharedView'
import { shareTokenFromUrl } from './features/sharing/sharedPayload'
import { SheetEditor } from './features/sheets/SheetEditor'
import { SheetList } from './features/sheets/SheetList'
import { SheetPage } from './features/sheets/SheetPage'
import { useRowCounts } from './features/sheets/useRowCounts'
import { useSheetActions, useSheets } from './features/sheets/useSheets'
import { Sidebar } from './features/workspaces/Sidebar'
import { WorkspaceEditor } from './features/workspaces/WorkspaceEditor'
import { useWorkspaceActions, useWorkspaces } from './features/workspaces/useWorkspaces'

// ---------------------------------------------------------------------------
// auth gate
// ---------------------------------------------------------------------------

export default function App() {
  const [shareToken] = useState<string | null>(() => shareTokenFromUrl())
  const [session, setSession] = useState<Session | null>(null)
  const [checking, setChecking] = useState(true)
  const [reset, setReset] = useState<'none' | 'asking' | 'recovery'>('none')
  const { theme, setTheme, accent, setAccent } = useAppearance()

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
    // Clear the recovery fragment so a refresh does not reopen the form.
    const done = () => {
      window.history.replaceState(null, '', window.location.pathname)
      setReset('none')
    }
    return (
      <SetNewPassword
        email={session.user.email ?? ''}
        onDone={done}
        onCancel={() => {
          void supabase.auth.signOut()
          done()
        }}
      />
    )
  }

  if (!session) {
    if (reset === 'asking') return <ForgotPassword onBack={() => setReset('none')} />
    return <Auth onForgot={() => setReset('asking')} />
  }

  const email = session.user.email ?? ''
  const look = { theme, accent, onTheme: setTheme, onAccent: setAccent }
  return (
    <Gate email={email} {...look}>
      {(profile, rename) => (
        <FeedbackProvider>
          <QueryProvider>
            <Home email={email} profile={profile} onRename={rename} {...look} />
          </QueryProvider>
        </FeedbackProvider>
      )}
    </Gate>
  )
}

// ---------------------------------------------------------------------------
// layout
// ---------------------------------------------------------------------------

type ShareTarget = { scope: 'sheet' | 'workspace'; id: string; name: string }

function Home({
  email,
  profile,
  theme,
  accent,
  onTheme,
  onAccent,
  onRename,
}: {
  email: string
  profile: Profile
  theme: Theme
  accent: string
  onTheme: (t: Theme) => void
  onAccent: (hex: string) => void
  onRename: (name: string) => Promise<boolean>
}) {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [sheetId, setSheetId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sheetModal, setSheetModal] = useState<{ editing: Sheet | null } | null>(null)
  const [wsModal, setWsModal] = useState<{ editing: Workspace | null } | null>(null)
  const [columnsOpen, setColumnsOpen] = useState(false)
  const [themeOpen, setThemeOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [supportOpen, setSupportOpen] = useState(false)
  const [shareModal, setShareModal] = useState<ShareTarget | null>(null)
  const [collapsed, setCollapsed] = useState(false)

  const workspacesQ = useWorkspaces()
  const sheetsQ = useSheets()
  const fieldsQ = useFields()
  const workspaces = useMemo(() => workspacesQ.data ?? [], [workspacesQ.data])
  const sheets = useMemo(() => sheetsQ.data ?? [], [sheetsQ.data])
  const fields = useMemo(() => fieldsQ.data ?? [], [fieldsQ.data])
  const counts = useRowCounts(sheets)
  const busy = useBusy()
  const reload = useReload()
  const feedback = useFeedback()

  const loadError = workspacesQ.error ?? sheetsQ.error ?? fieldsQ.error
  const loading = workspacesQ.isPending || sheetsQ.isPending || fieldsQ.isPending || counts.pending
  const error = loadError?.message ?? feedback.error

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

  const workspaceActions = useWorkspaceActions({
    onCreated: setWorkspaceId,
    onDeleted: (id) => workspaceId === id && setWorkspaceId(null),
  })
  const sheetActions = useSheetActions({
    onCreated: (id) => {
      setSheetId(id)
      setColumnsOpen(true)
    },
    onDeleted: (id) => sheetId === id && setSheetId(null),
  })
  const columnActions = useColumnActions(sheet, sheetFields, () => void reload())

  return (
    <div className={`app${collapsed ? ' railed' : ''}`}>
      <header className="topbar">
        <div className="brandrow">
          <button className="brandbtn" onClick={() => setSheetId(null)} aria-label="Back to sheets">
            <Brand name={profile.db_name} />
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

          {counts.warning && !error && (
            <div className="alert">
              <b>Row counts are unavailable: {counts.warning}</b>
              <br />
              Your data is fine. Open a sheet to see its rows.
            </div>
          )}

          {loading ? (
            <div className="booting">Loading…</div>
          ) : loadError ? null : !workspaces.length ? (
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
              rowCounts={counts.rows}
              doneCounts={counts.done}
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
              onDelete={(s) => void sheetActions.destroyFromList(s)}
              onDuplicate={(s, withRows) => void sheetActions.copy(s, withRows)}
            />
          ) : (
            <SheetPage
              workspace={openWorkspace}
              sheet={sheet}
              fields={sheetFields}
              query={query}
              onQuery={setQuery}
              selected={selected}
              onSelect={setSelected}
              accent={accent}
              busy={busy}
              onBack={() => setSheetId(null)}
              onShare={() => setShareModal({ scope: 'sheet', id: sheet.id, name: sheet.name })}
              onColumns={() => setColumnsOpen(true)}
              onSettings={() => setSheetModal({ editing: sheet })}
              reload={() => void reload()}
            />
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

      {sheetModal && (
        <SheetEditor
          editing={sheetModal.editing}
          busy={busy}
          onClose={() => setSheetModal(null)}
          onSave={(d) => sheetActions.save(sheetModal.editing, d, openWorkspace, workspaceSheets)}
          onDelete={sheetModal.editing ? () => sheetActions.destroy(sheetModal.editing!) : null}
        />
      )}

      {wsModal && (
        <WorkspaceEditor
          editing={wsModal.editing}
          busy={busy}
          onClose={() => setWsModal(null)}
          onSave={(d) => workspaceActions.save(wsModal.editing, d)}
          onDelete={wsModal.editing ? () => workspaceActions.destroy(wsModal.editing!) : null}
        />
      )}

      {columnsOpen && sheet && (
        <ColumnManager
          sheetName={sheet.name}
          fields={sheetFields}
          busy={busy}
          onClose={() => setColumnsOpen(false)}
          onAdd={columnActions.add}
          onEdit={columnActions.edit}
          onDelete={columnActions.destroy}
          onMove={(i, by) => void columnActions.shift(i, by)}
          onMakeTitle={(id) => void columnActions.makeTitle(id)}
        />
      )}

      {themeOpen && (
        <ThemePicker
          dbName={profile.db_name}
          theme={theme}
          accent={accent}
          onTheme={onTheme}
          onAccent={onAccent}
          onRename={onRename}
          onClose={() => setThemeOpen(false)}
        />
      )}

      {profileOpen && (
        <ProfileModal
          email={email}
          dbName={profile.db_name}
          since={profile.created_at}
          workspaces={workspaces.length}
          sheets={sheets.length}
          rows={counts.total}
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
      <div className={`toast${feedback.toast ? ' show' : ''}`}>{feedback.toast}</div>
    </div>
  )
}

function countBy(sheets: Sheet[]) {
  const map = new Map<string, number>()
  for (const s of sheets) map.set(s.workspace_id, (map.get(s.workspace_id) ?? 0) + 1)
  return map
}
