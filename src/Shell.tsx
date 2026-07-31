import { useState } from 'react'
import type { Sheet, Workspace } from './db'

/**
 * The two halves of the home screen.
 *
 * `Sidebar` lists workspaces and collapses to a rail. `SheetList` is the middle
 * column: one row per sheet, in a list rather than a card grid, so a long list
 * stays scannable down a single edge instead of forcing your eye across a wall
 * of tiles.
 */

// ---------------------------------------------------------------------------
// workspaces
// ---------------------------------------------------------------------------

export function Sidebar({
  workspaces,
  activeId,
  counts,
  collapsed,
  busy,
  onToggle,
  onSelect,
  onNew,
  onEdit,
}: {
  workspaces: Workspace[]
  activeId: string | null
  counts: Map<string, number>
  collapsed: boolean
  busy: boolean
  onToggle: () => void
  onSelect: (id: string) => void
  onNew: () => void
  onEdit: (w: Workspace) => void
}) {
  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      <div className="sidehead">
        <button
          className="sidetoggle"
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand workspaces' : 'Collapse workspaces'}
          onClick={onToggle}
        >
          {collapsed ? '‹' : '›'}
        </button>
        {!collapsed && <span className="sidetitle">Workspaces</span>}
      </div>

      {!collapsed && (
        <>
          <div className="sidelist">
            {workspaces.map((w) => (
              <div
                key={w.id}
                className={`sideitem${w.id === activeId ? ' on' : ''}`}
                style={{ ['--acc' as string]: w.accent }}
              >
                <button className="sideitemmain" onClick={() => onSelect(w.id)}>
                  <span className="sidedot" style={{ background: w.accent }} />
                  <span className="sidename">{w.name}</span>
                  <span className="sidecount">{counts.get(w.id) ?? 0}</span>
                </button>
                <button
                  className="sideedit"
                  disabled={busy}
                  aria-label={`Settings for ${w.name}`}
                  onClick={() => onEdit(w)}
                >
                  ⋯
                </button>
              </div>
            ))}
            {!workspaces.length && (
              <p className="sideempty">No workspaces yet.</p>
            )}
          </div>

          <button className="sidenew" disabled={busy} onClick={onNew}>
            + New workspace
          </button>
        </>
      )}

      {collapsed && (
        <div className="siderail">
          {workspaces.map((w) => (
            <button
              key={w.id}
              className={`raildot${w.id === activeId ? ' on' : ''}`}
              style={{ background: w.accent }}
              title={w.name}
              aria-label={w.name}
              onClick={() => onSelect(w.id)}
            />
          ))}
        </div>
      )}
    </aside>
  )
}

// ---------------------------------------------------------------------------
// sheets
// ---------------------------------------------------------------------------

export function SheetList({
  workspace,
  sheets,
  rowCounts,
  doneCounts,
  busy,
  onOpen,
  onNew,
  onEdit,
  onDelete,
  onDuplicate,
}: {
  workspace: Workspace
  sheets: Sheet[]
  rowCounts: Map<string, number>
  doneCounts: Map<string, number>
  busy: boolean
  onOpen: (id: string) => void
  onNew: () => void
  onEdit: (s: Sheet) => void
  onDelete: (s: Sheet) => void
  onDuplicate: (sheet: Sheet, includeContents: boolean) => void
}) {
  const [query, setQuery] = useState('')

  const shown = query.trim()
    ? sheets.filter((s) =>
        `${s.name} ${s.description}`.toLowerCase().includes(query.toLowerCase()),
      )
    : sheets

  return (
    <section className="listpage">
      <div className="listhead">
        <div>
          <h1>{workspace.name}</h1>
          {workspace.description && <p className="desc">{workspace.description}</p>}
        </div>
        <button className="primary" disabled={busy} onClick={onNew}>
          + New sheet
        </button>
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
          <button className="primary" onClick={onNew}>
            Create your first sheet
          </button>
        </div>
      ) : !shown.length ? (
        <div className="hollow">Nothing matches that search.</div>
      ) : (
        <ul className="rows">
          {shown.map((s) => {
            const total = rowCounts.get(s.id) ?? 0
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
                    {`${total} ${total === 1 ? 'row' : 'rows'}`}
                    {done > 0 && (
                      <span className="rowdone">
                        {`${done} ${s.done_label.toLowerCase()}`}
                      </span>
                    )}
                  </span>
                </button>
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
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
