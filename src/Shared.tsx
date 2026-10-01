import { useEffect, useMemo, useState } from 'react'
import { supabase, type Field, type Record_, type Sheet, type Workspace } from './db'
import { savedAccent } from './theme'
import { Brand } from './Brand'
import { SheetList } from './Shell'
import { SheetView } from './Sheet'

// Public share view: the owner's SheetList and SheetView in read-only mode. Its only call is get_shared.
// ---------------------------------------------------------------------------
// what get_shared returns
// ---------------------------------------------------------------------------

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

interface SharedPayload {
  scope: 'sheet' | 'workspace'
  db_name: string
  title: string
  description: string
  sheets: SharedSheet[]
}

// Shown when the shared thing has no description of its own.
const CAUTION =
  'A private link. If this was not meant for you, please close it and let the owner know.'

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
async function loadShared(token: string): Promise<SharedPayload | null> {
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

const sheetId = (s: SharedSheet) => `shared-${s.n}`

// ---------------------------------------------------------------------------
// adapting the payload to the shapes the real components expect
// ---------------------------------------------------------------------------

// Owner-only columns get placeholders; read-only mode never reads them.
function asSheet(s: SharedSheet, workspaceId: string): Sheet {
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

function asFields(s: SharedSheet): Field[] {
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

function asRecords(s: SharedSheet): Record_[] {
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

const noop = () => undefined

// ---------------------------------------------------------------------------

export function SharedView({ token }: { token: string }) {
  const [data, setData] = useState<SharedPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [problem, setProblem] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const accent = savedAccent()

  useEffect(() => {
    // Keep share pages out of search results.
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow'
    document.head.appendChild(meta)
    return () => {
      document.head.removeChild(meta)
    }
  }, [])

  useEffect(() => {
    let alive = true
    loadShared(token).then(
      (payload) => {
        if (!alive) return
        if (!payload) setProblem('gone')
        else setData(payload)
        setLoading(false)
      },
      (error: { message: string }) => {
        if (!alive) return
        setProblem(error.message)
        setLoading(false)
      },
    )
    return () => {
      alive = false
    }
  }, [token])

  const sheets = useMemo(() => data?.sheets ?? [], [data])

  // A single-sheet share opens straight into it.
  const openShared =
    sheets.find((s) => sheetId(s) === openId) ?? (sheets.length === 1 ? sheets[0] : null)

  const workspace: Workspace = {
    id: 'shared',
    owner_id: '',
    name: data?.title ?? '',
    description: data?.description?.trim() || CAUTION,
    accent,
    position: 0,
    created_at: '',
  }

  const rowCounts = useMemo(() => new Map(sheets.map((s) => [sheetId(s), s.total])), [sheets])
  const doneCounts = useMemo(() => new Map(sheets.map((s) => [sheetId(s), s.done])), [sheets])

  const fields = useMemo(() => (openShared ? asFields(openShared) : []), [openShared])
  const allRows = useMemo(() => (openShared ? asRecords(openShared) : []), [openShared])
  const rows = useMemo(() => {
    if (!query.trim()) return allRows
    const q = query.toLowerCase()
    return allRows.filter((r) =>
      fields
        .map((f) => {
          const v = r.cells[f.key]
          return Array.isArray(v) ? v.join(' ') : String(v ?? '')
        })
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }, [allRows, fields, query])

  if (loading) return <div className="booting">Loading…</div>

  if (problem) {
    return (
      <div className="sharegate">
        <div className="authcard">
          <Brand name="yours" />
          <h2 style={{ marginTop: 14 }}>
            {problem === 'gone' ? 'This link is no longer active' : 'Something went wrong'}
          </h2>
          <p className="help">
            {problem === 'gone'
              ? 'It may have been revoked by its owner, or it may have expired. Ask them for a new one.'
              : problem}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="app shared">
      <header className="topbar">
        <div className="brandrow">
          <Brand name={data?.db_name ?? ''} />
          <span className="readonly">Read only</span>
        </div>
      </header>

      <div className="body">
        <main className="main">
          {!openShared ? (
            <SheetList
              workspace={workspace}
              sheets={sheets.map((s) => asSheet(s, 'shared'))}
              rowCounts={rowCounts}
              doneCounts={doneCounts}
              busy={false}
              readOnly
              onOpen={setOpenId}
              onNew={noop}
              onShare={noop}
              onEdit={noop}
              onDelete={noop}
              onDuplicate={noop}
            />
          ) : (
            <>
              <div className="sheethead">
                <div>
                  {sheets.length > 1 && (
                    <button className="backlink" onClick={() => setOpenId(null)}>
                      ‹ {data?.title}
                    </button>
                  )}
                  <h1>{openShared.name}</h1>
                  <p className="desc">
                    {openShared.description?.trim() || (sheets.length > 1 ? '' : CAUTION)}
                  </p>
                </div>
              </div>

              <div className="toolbar">
                <input
                  type="search"
                  placeholder="Search every column…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <span className="tally">
                  {`${rows.length} ${rows.length === 1 ? 'row' : 'rows'}`}
                </span>
              </div>

              <SheetView
                sheet={asSheet(openShared, 'shared')}
                fields={fields}
                rows={rows}
                accent={accent}
                busy={false}
                readOnly
                canReorder={false}
                onMoveRow={noop}
                selected={new Set()}
                onSelect={noop}
                onToggleDone={noop}
                onEdit={noop}
                onDelete={noop}
                onAdd={noop}
                onColumns={noop}
                onGroupDone={noop}
                onGroupDuplicate={noop}
                onGroupDelete={noop}
                onGroupSet={noop}
              />
            </>
          )}

          <p className="sharefoot">
            Shared from <Brand name="yours" className="sharefootbrand" />. This is only read-only
            view. Changes made by the owner appear when you refresh.
          </p>
        </main>
      </div>
    </div>
  )
}
