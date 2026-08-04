import { useEffect, useMemo, useState } from 'react'
import { supabase, type Field, type Record_, type Sheet, type Workspace } from './db'
import { savedAccent } from './theme'
import { Brand } from './Brand'
import { SheetList } from './Shell'
import { SheetView } from './Sheet'

/**
 * The public view of a shared link.
 *
 * It deliberately renders the *same* `SheetList` and `SheetView` the owner
 * sees, in read-only mode, rather than a parallel set of components. A second
 * implementation would drift: a column type added to one and not the other, a
 * colour fixed in one place only. One layout, one place to change it.
 *
 * Runs before any auth check. Its only call is `get_shared`, the single
 * function anonymous callers may execute.
 */

// ---------------------------------------------------------------------------
// what get_shared returns
// ---------------------------------------------------------------------------

interface SharedSheet {
  id: string
  name: string
  description: string
  accent: string
  done_label: string
  fields: Omit<Field, 'owner_id' | 'sheet_id' | 'position' | 'created_at' | 'required'>[]
  records: { id: string; cells: Record_['cells']; done: boolean }[]
}

interface SharedPayload {
  scope: 'sheet' | 'workspace'
  /** What the owner calls their database. */
  db_name: string
  /** The workspace or sheet that was shared. */
  title: string
  /** Its own description, or empty. */
  description: string
  sheets: SharedSheet[]
}

/**
 * Shown when the shared thing has no description of its own. A share link is
 * unguessable but not secret — if it reached someone by accident, saying so
 * plainly is more useful than an empty subtitle.
 */
const CAUTION =
  'A private link. If this was not meant for you, please close it and let the owner know.'

export function shareTokenFromUrl(): string | null {
  const fromQuery = new URLSearchParams(window.location.search).get('s')
  if (fromQuery) return fromQuery
  const path = window.location.pathname.match(/^\/s\/([A-Za-z0-9_-]{32,})$/)
  return path ? path[1] : null
}

/** 32 random bytes, URL-safe. Long enough that guessing is not a strategy. */
export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(32)))
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// ---------------------------------------------------------------------------
// adapting the payload to the shapes the real components expect
//
// The function returns only what a viewer needs, so the owner-only columns are
// filled in with placeholders here. Nothing reads them in read-only mode; they
// exist so the same components can be used without loosening their types.
// ---------------------------------------------------------------------------

function asSheet(s: SharedSheet, workspaceId: string): Sheet {
  return {
    id: s.id,
    owner_id: '',
    workspace_id: workspaceId,
    name: s.name,
    description: s.description,
    accent: s.accent,
    done_label: s.done_label,
    //is_vault: false,
    position: 0,
    created_at: '',
  }
}

function asFields(s: SharedSheet): Field[] {
  return s.fields.map((f, i) => ({
    ...f,
    owner_id: '',
    sheet_id: s.id,
    required: false,
    position: i,
    created_at: '',
  })) as Field[]
}

function asRecords(s: SharedSheet): Record_[] {
  return s.records.map((r, i) => ({
    id: r.id,
    owner_id: '',
    sheet_id: s.id,
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
    // A shared page should never end up in search results. Someone pasting a
    // link somewhere crawlable should not also be publishing it to Google.
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
    void supabase
      .rpc('get_shared', { share_token: token })
      .then(({ data: payload, error }) => {
        if (!alive) return
        if (error) setProblem(error.message)
        else if (!payload) setProblem('gone')
        else setData(payload as SharedPayload)
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [token])

  const sheets = useMemo(() => data?.sheets ?? [], [data])

  // A single-sheet share opens straight into it; there is no list to show.
  const openShared =
    sheets.find((s) => s.id === openId) ?? (sheets.length === 1 ? sheets[0] : null)

  const workspace: Workspace = {
    id: 'shared',
    owner_id: '',
    name: data?.title ?? '',
    description: data?.description?.trim() || CAUTION,
    accent,
    position: 0,
    created_at: '',
  }

  const rowCounts = useMemo(
    () => new Map(sheets.map((s) => [s.id, s.records.length])),
    [sheets],
  )
  const doneCounts = useMemo(
    () => new Map(sheets.map((s) => [s.id, s.records.filter((r) => r.done).length])),
    [sheets],
  )

  const fields = openShared ? asFields(openShared) : []
  const allRows = openShared ? asRecords(openShared) : []
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
                    {openShared.description?.trim() ||
                      (sheets.length > 1 ? '' : CAUTION)}
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
