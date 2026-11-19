import { useState } from 'react'
import type { Sheet, Workspace } from '../../db'

export function SheetList({
  workspace,
  sheets,
  rowCounts,
  doneCounts,
  busy,
  readOnly = false,
  onOpen,
  onNew,
  onShare,
  onEdit,
  onDelete,
  onDuplicate,
}: {
  workspace: Workspace
  sheets: Sheet[]
  rowCounts: Map<string, number>
  doneCounts: Map<string, number>
  busy: boolean
  // Share view: the list without anything that changes data.
  readOnly?: boolean
  onOpen: (id: string) => void
  onNew: () => void
  onShare: () => void
  onEdit: (s: Sheet) => void
  onDelete: (s: Sheet) => void
  onDuplicate: (sheet: Sheet, includeContents: boolean) => void
}) {
  const [query, setQuery] = useState('')

  const shown = query.trim()
    ? sheets.filter((s) => `${s.name} ${s.description}`.toLowerCase().includes(query.toLowerCase()))
    : sheets

  return (
    <section className="listpage">
      <div className="listhead">
        <div>
          <h1>{workspace.name}</h1>
          {workspace.description && <p className="desc">{workspace.description}</p>}
        </div>
        {!readOnly && (
          <div className="listactions">
            <button disabled={busy} onClick={onShare}>
              Share
            </button>
            <button className="primary" disabled={busy} onClick={onNew}>
              + New sheet
            </button>
          </div>
        )}
      </div>

      {sheets.length > 0 && (
        <div className="listbar">
          <input
            type="search"
            placeholder="Search sheets…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span className="tally">
            {`${shown.length} of ${sheets.length} ${sheets.length === 1 ? 'sheet' : 'sheets'}`}
          </span>
        </div>
      )}

      {!sheets.length ? (
        <div className="hollow big">
          <h2>No sheets yet</h2>
          <p>A sheet is a table you design: pick the columns, pick their types, add rows.</p>
          {!readOnly && (
            <button className="primary" onClick={onNew}>
              Create your first sheet
            </button>
          )}
        </div>
      ) : !shown.length ? (
        <div className="hollow">Nothing matches that search.</div>
      ) : (
        <ul className="rows">
          {shown.map((s) => {
            const total = rowCounts.get(s.id)
            const done = doneCounts.get(s.id) ?? 0
            return (
              <li key={s.id} className="rowitem" style={{ ['--acc' as string]: s.accent }}>
                <button className="rowmain" onClick={() => onOpen(s.id)}>
                  <span className="rowstripe" style={{ background: s.accent }} />
                  <span className="rowtext">
                    <span className="rowname">{s.name}</span>
                    {s.description && <span className="rowdesc">{s.description}</span>}
                  </span>
                  <span className="rowmeta">
                    {total === undefined ? '– rows' : `${total} ${total === 1 ? 'row' : 'rows'}`}
                    {done > 0 && (
                      <span className="rowdone">{`${done} ${s.done_label.toLowerCase()}`}</span>
                    )}
                  </span>
                </button>
                {!readOnly && (
                  <div className="rowtools">
                    <button
                      disabled={busy}
                      aria-label={`Duplicate ${s.name} without contents`}
                      title="Duplicate structure only"
                      onClick={() => onDuplicate(s, false)}
                    >
                      ⧉
                    </button>
                    <button
                      disabled={busy}
                      aria-label={`Duplicate ${s.name} with contents`}
                      title="Duplicate with contents"
                      onClick={() => onDuplicate(s, true)}
                    >
                      ⧉+
                    </button>
                    <button
                      disabled={busy}
                      aria-label={`Settings for ${s.name}`}
                      onClick={() => onEdit(s)}
                    >
                      ⋯
                    </button>
                    <button
                      disabled={busy}
                      aria-label={`Delete ${s.name}`}
                      onClick={() => onDelete(s)}
                    >
                      ✕
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
