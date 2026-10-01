import { useEffect, useMemo, useState } from 'react'
import type { Workspace } from '../../db'
import { savedAccent } from '../../theme'
import { Brand } from '../../components/Brand'
import { SheetList } from '../sheets/SheetList'
import { SheetView } from '../rows/SheetView'
import {
  asFields,
  asRecords,
  asSheet,
  loadShared,
  sheetId,
  type SharedPayload,
} from './sharedPayload'

// Shown when the shared thing has no description of its own.
const CAUTION =
  'A private link. If this was not meant for you, please close it and let the owner know.'

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
