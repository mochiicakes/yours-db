import type { Workspace } from '../../db'

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
            {!workspaces.length && <p className="sideempty">No workspaces yet.</p>}
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
