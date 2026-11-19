import { useMemo, useState } from 'react'
import { rowSearchText, type Field, type Record_, type Sheet, type Workspace } from '../../db'
import { SheetView } from '../rows/SheetView'
import { RowEditor } from '../rows/RowEditor'
import { useRecords, useRowActions } from '../rows/useRecords'

// One open sheet: its header, the search and add-row toolbar, the table and the row editor.
export function SheetPage({
  workspace,
  sheet,
  fields,
  query,
  onQuery,
  selected,
  onSelect,
  accent,
  busy,
  onBack,
  onShare,
  onColumns,
  onSettings,
  reload,
}: {
  workspace: Workspace
  sheet: Sheet
  fields: Field[]
  query: string
  onQuery: (q: string) => void
  selected: Set<string>
  onSelect: (next: Set<string>) => void
  accent: string
  busy: boolean
  onBack: () => void
  onShare: () => void
  onColumns: () => void
  onSettings: () => void
  reload: () => void
}) {
  const [rowModal, setRowModal] = useState<{ editing: Record_ | null } | null>(null)
  const records = useRecords(sheet.id)
  const actions = useRowActions(sheet, fields, reload)
  const loaded = records.data !== undefined

  const rows = useMemo(() => {
    let list = [...(records.data ?? [])].sort((a, b) => a.position - b.position)
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter((r) => rowSearchText(fields, r).includes(q))
    }
    return list
  }, [records.data, query, fields])

  const doneCount = rows.filter((r) => r.done).length
  const chosenIds = useMemo(
    () => rows.filter((r) => selected.has(r.id)).map((r) => r.id),
    [rows, selected],
  )

  return (
    <>
      <div className="sheethead">
        <div>
          <button className="backlink" onClick={onBack}>
            ‹ {workspace.name}
          </button>
          <h1>{sheet.name}</h1>
          {sheet.description && <p className="desc">{sheet.description}</p>}
        </div>
        <div className="sheettools">
          <button onClick={onShare}>Share</button>
          <button onClick={onColumns}>Columns</button>
          <button onClick={onSettings}>Settings</button>
        </div>
      </div>

      <div className="toolbar">
        <input
          type="search"
          placeholder="Search every column…"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />
        <button
          className="primary"
          disabled={!fields.length}
          title={fields.length ? undefined : 'Add a column first'}
          onClick={() => setRowModal({ editing: null })}
        >
          + Add row
        </button>
        <span className="tally">
          {!loaded
            ? '…'
            : `${rows.length} ${rows.length === 1 ? 'row' : 'rows'}${
                doneCount > 0 ? ` · ${doneCount} ${sheet.done_label.toLowerCase()}` : ''
              }`}
        </span>
      </div>

      {!loaded ? (
        <div className="booting">Loading rows…</div>
      ) : (
        <SheetView
          sheet={sheet}
          fields={fields}
          rows={rows}
          onMoveRow={(activeId, overId) => void actions.move(activeId, overId, !!query.trim())}
          canReorder={!query.trim()}
          accent={accent}
          busy={busy}
          selected={selected}
          onSelect={onSelect}
          onToggleDone={actions.toggleDone}
          onEdit={(r) => setRowModal({ editing: r })}
          onDelete={actions.deleteRow}
          onAdd={() => setRowModal({ editing: null })}
          onColumns={onColumns}
          onGroupDone={(done) => actions.groupDone(chosenIds, done)}
          onGroupDuplicate={() =>
            void actions.groupDuplicate(chosenIds).then((ok) => ok && onSelect(new Set()))
          }
          onGroupDelete={() =>
            void actions.groupDelete(chosenIds).then((ok) => ok && onSelect(new Set()))
          }
          onGroupSet={(k, v) => void actions.groupSet(chosenIds, k, v)}
        />
      )}

      {rowModal && (
        <RowEditor
          fields={fields}
          editing={rowModal.editing}
          accent={accent}
          busy={busy}
          onClose={() => setRowModal(null)}
          onSave={(cells) => actions.save(rowModal.editing, cells)}
        />
      )}
    </>
  )
}
