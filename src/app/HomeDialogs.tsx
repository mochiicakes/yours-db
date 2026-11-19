import type { Field, Profile, Sheet, Workspace } from '../db'
import type { Theme } from '../theme'
import { ColumnManager } from '../features/columns/ColumnManager'
import type { useColumnActions } from '../features/columns/useFields'
import { ProfileModal } from '../features/settings/ProfileModal'
import { SupportModal } from '../features/settings/SupportModal'
import { ThemePicker } from '../features/settings/ThemePicker'
import { ShareModal } from '../features/sharing/ShareModal'
import { SheetEditor } from '../features/sheets/SheetEditor'
import type { useSheetActions } from '../features/sheets/useSheets'
import { WorkspaceEditor } from '../features/workspaces/WorkspaceEditor'
import type { useWorkspaceActions } from '../features/workspaces/useWorkspaces'
import type { Dialogs } from './useDialogs'

export function HomeDialogs({
  dialogs: d,
  email,
  profile,
  theme,
  accent,
  onTheme,
  onAccent,
  onRename,
  workspaces,
  sheets,
  totalRows,
  sheet,
  sheetFields,
  openWorkspace,
  workspaceSheets,
  busy,
  sheetActions,
  workspaceActions,
  columnActions,
}: {
  dialogs: Dialogs
  email: string
  profile: Profile
  theme: Theme
  accent: string
  onTheme: (t: Theme) => void
  onAccent: (hex: string) => void
  onRename: (name: string) => Promise<boolean>
  workspaces: Workspace[]
  sheets: Sheet[]
  totalRows: number
  sheet: Sheet | null
  sheetFields: Field[]
  openWorkspace: Workspace | null
  workspaceSheets: Sheet[]
  busy: boolean
  sheetActions: ReturnType<typeof useSheetActions>
  workspaceActions: ReturnType<typeof useWorkspaceActions>
  columnActions: ReturnType<typeof useColumnActions>
}) {
  const { sheetModal, wsModal, shareModal } = d
  return (
    <>
      {sheetModal && (
        <SheetEditor
          editing={sheetModal.editing}
          busy={busy}
          onClose={() => d.setSheetModal(null)}
          onSave={(draft) =>
            sheetActions.save(sheetModal.editing, draft, openWorkspace, workspaceSheets)
          }
          onDelete={sheetModal.editing ? () => sheetActions.destroy(sheetModal.editing!) : null}
        />
      )}

      {wsModal && (
        <WorkspaceEditor
          editing={wsModal.editing}
          busy={busy}
          onClose={() => d.setWsModal(null)}
          onSave={(draft) => workspaceActions.save(wsModal.editing, draft)}
          onDelete={wsModal.editing ? () => workspaceActions.destroy(wsModal.editing!) : null}
        />
      )}

      {d.columnsOpen && sheet && (
        <ColumnManager
          sheetName={sheet.name}
          fields={sheetFields}
          busy={busy}
          onClose={() => d.setColumnsOpen(false)}
          onAdd={columnActions.add}
          onEdit={columnActions.edit}
          onDelete={columnActions.destroy}
          onMove={(i, by) => void columnActions.shift(i, by)}
          onMakeTitle={(id) => void columnActions.makeTitle(id)}
        />
      )}

      {d.themeOpen && (
        <ThemePicker
          dbName={profile.db_name}
          theme={theme}
          accent={accent}
          onTheme={onTheme}
          onAccent={onAccent}
          onRename={onRename}
          onClose={() => d.setThemeOpen(false)}
        />
      )}

      {d.profileOpen && (
        <ProfileModal
          email={email}
          dbName={profile.db_name}
          since={profile.created_at}
          workspaces={workspaces.length}
          sheets={sheets.length}
          rows={totalRows}
          onClose={() => d.setProfileOpen(false)}
        />
      )}

      {d.supportOpen && <SupportModal onClose={() => d.setSupportOpen(false)} />}
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
          onClose={() => d.setShareModal(null)}
        />
      )}
    </>
  )
}
