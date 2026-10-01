import { supabase, type Field, type Record_, type Sheet } from '../../db'

// No database ids: sheets and rows are keyed by position, columns by key.
interface SharedSheet {
  n: number
  name: string
  description: string
  accent: string
  done_label: string
  fields: Omit<Field, 'id' | 'owner_id' | 'sheet_id' | 'position' | 'created_at' | 'required'>[]
  total: number
  done: number
  records: { n: number; cells: Record_['cells']; done: boolean }[]
}

export interface SharedPayload {
  scope: 'sheet' | 'workspace'
  db_name: string
  title: string
  description: string
  sheets: SharedSheet[]
}

// Shown when the shared thing has no description of its own.

export function shareTokenFromUrl(): string | null {
  const fromQuery = new URLSearchParams(window.location.search).get('s')
  if (fromQuery) return fromQuery
  const path = window.location.pathname.match(/^\/s\/([A-Za-z0-9_-]{32,})$/)
  return path ? path[1] : null
}

// 32 random bytes, URL-safe.
export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(32)))
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// get_shared caps this at 1000.
const PAGE = 500

// First page of every sheet, then the rest page by page.
export async function loadShared(token: string): Promise<SharedPayload | null> {
  const { data, error } = await supabase.rpc('get_shared', { share_token: token, p_limit: PAGE })
  if (error) throw error
  const payload = data as SharedPayload | null
  if (!payload) return null
  for (const sheet of payload.sheets) {
    while (sheet.records.length < sheet.total) {
      const more = await supabase.rpc('get_shared', {
        share_token: token,
        p_sheet: sheet.n,
        p_offset: sheet.records.length,
        p_limit: PAGE,
      })
      if (more.error) throw more.error
      const page = (more.data as SharedPayload | null)?.sheets[0]?.records ?? []
      if (!page.length) break
      sheet.records.push(...page)
    }
  }
  return payload
}

export const sheetId = (s: SharedSheet) => `shared-${s.n}`

// ---------------------------------------------------------------------------
// adapting the payload to the shapes the real components expect
// ---------------------------------------------------------------------------

// Owner-only columns get placeholders; read-only mode never reads them.
export function asSheet(s: SharedSheet, workspaceId: string): Sheet {
  return {
    id: sheetId(s),
    owner_id: '',
    workspace_id: workspaceId,
    name: s.name,
    description: s.description,
    accent: s.accent,
    done_label: s.done_label,
    position: 0,
    created_at: '',
  }
}

export function asFields(s: SharedSheet): Field[] {
  return s.fields.map((f, i) => ({
    ...f,
    id: `${sheetId(s)}:${f.key}`,
    owner_id: '',
    sheet_id: sheetId(s),
    required: false,
    position: i,
    created_at: '',
  })) as Field[]
}

export function asRecords(s: SharedSheet): Record_[] {
  return s.records.map((r, i) => ({
    id: `${sheetId(s)}:${r.n}`,
    owner_id: '',
    sheet_id: sheetId(s),
    cells: r.cells,
    done: r.done,
    position: i,
    created_at: '',
    updated_at: '',
  }))
}
