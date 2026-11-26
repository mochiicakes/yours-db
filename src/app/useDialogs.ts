import { useState } from 'react'
import type { Sheet, Workspace } from '../db'

type ShareTarget = { scope: 'sheet' | 'workspace'; id: string; name: string }

// Which dialogs are open. Kept as separate flags: creating a sheet opens the column manager while the sheet editor closes.
export function useDialogs() {
  const [sheetModal, setSheetModal] = useState<{ editing: Sheet | null } | null>(null)
  const [wsModal, setWsModal] = useState<{ editing: Workspace | null } | null>(null)
  const [columnsOpen, setColumnsOpen] = useState(false)
  const [themeOpen, setThemeOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [supportOpen, setSupportOpen] = useState(false)
  const [shareModal, setShareModal] = useState<ShareTarget | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  return {
    sheetModal,
    setSheetModal,
    wsModal,
    setWsModal,
    columnsOpen,
    setColumnsOpen,
    themeOpen,
    setThemeOpen,
    profileOpen,
    setProfileOpen,
    supportOpen,
    setSupportOpen,
    shareModal,
    setShareModal,
    importOpen,
    setImportOpen,
  }
}

export type Dialogs = ReturnType<typeof useDialogs>
