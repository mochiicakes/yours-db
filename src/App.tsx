import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, type Profile } from './db'
import type { Theme } from './theme'
import { FeedbackProvider, useFeedback } from './app/feedback'
import { QueryProvider } from './app/QueryProvider'
import { useBusy, useReload } from './app/cache'
import { HomeDialogs } from './app/HomeDialogs'
import { useDialogs } from './app/useDialogs'
import { useHomeData } from './app/useHomeData'
import { Brand } from './components/Brand'
import { Auth } from './features/auth/Auth'
import { Gate } from './features/auth/Gate'
import { ForgotPassword, SetNewPassword } from './features/auth/ResetPassword'
import { useColumnActions } from './features/columns/useFields'
import { UserMenu } from './features/settings/UserMenu'
import { useAppearance } from './features/settings/useAppearance'
import { SharedView } from './features/sharing/SharedView'
import { shareTokenFromUrl } from './features/sharing/sharedPayload'
import { SheetList } from './features/sheets/SheetList'
import { SheetPage } from './features/sheets/SheetPage'
import { useSheetActions } from './features/sheets/useSheets'
import { Sidebar } from './features/workspaces/Sidebar'
import { useWorkspaceActions } from './features/workspaces/useWorkspaces'

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
  const {
    workspaceId,
    setWorkspaceId,
    sheetId,
    setSheetId,
    workspaces,
    sheets,
    counts,
    loading,
    loadError,
    openWorkspace,
    workspaceSheets,
    sheetsPerWorkspace,
    sheet,
    sheetFields,
  } = useHomeData()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [collapsed, setCollapsed] = useState(false)
  const dialogs = useDialogs()
  const busy = useBusy()
  const reload = useReload()
  const feedback = useFeedback()
  const error = loadError?.message ?? feedback.error

  const workspaceActions = useWorkspaceActions({
    onCreated: setWorkspaceId,
    onDeleted: (id) => workspaceId === id && setWorkspaceId(null),
  })
  const sheetActions = useSheetActions({
    onCreated: (id) => {
      setSheetId(id)
      dialogs.setColumnsOpen(true)
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
            onProfile={() => dialogs.setProfileOpen(true)}
            onSettings={() => dialogs.setThemeOpen(true)}
            onSupport={() => dialogs.setSupportOpen(true)}
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
                onClick={() => dialogs.setWsModal({ editing: null })}
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
              onNew={() => dialogs.setSheetModal({ editing: null })}
              onShare={() =>
                dialogs.setShareModal({
                  scope: 'workspace',
                  id: openWorkspace.id,
                  name: openWorkspace.name,
                })
              }
              onEdit={(s) => dialogs.setSheetModal({ editing: s })}
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
              onShare={() =>
                dialogs.setShareModal({ scope: 'sheet', id: sheet.id, name: sheet.name })
              }
              onColumns={() => dialogs.setColumnsOpen(true)}
              onSettings={() => dialogs.setSheetModal({ editing: sheet })}
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
          onNew={() => dialogs.setWsModal({ editing: null })}
          onEdit={(w) => dialogs.setWsModal({ editing: w })}
        />
      </div>

      <HomeDialogs
        dialogs={dialogs}
        email={email}
        profile={profile}
        theme={theme}
        accent={accent}
        onTheme={onTheme}
        onAccent={onAccent}
        onRename={onRename}
        workspaces={workspaces}
        sheets={sheets}
        totalRows={counts.total}
        sheet={sheet}
        sheetFields={sheetFields}
        openWorkspace={openWorkspace}
        workspaceSheets={workspaceSheets}
        busy={busy}
        sheetActions={sheetActions}
        workspaceActions={workspaceActions}
        columnActions={columnActions}
      />
      <div className={`toast${feedback.toast ? ' show' : ''}`}>{feedback.toast}</div>
    </div>
  )
}
