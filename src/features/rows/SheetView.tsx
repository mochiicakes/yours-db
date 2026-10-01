import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CHOICE_TYPES, type Field, type Record_, type Sheet } from '../../db'
import { GroupBar } from './GroupBar'
import { SortableRow } from './SortableRow'

interface Props {
  sheet: Sheet
  fields: Field[]
  rows: Record_[]
  accent: string
  busy: boolean
  // Read-only view: controls are absent, not disabled.
  readOnly?: boolean
  selected: Set<string>
  canReorder: boolean
  onMoveRow: (activeId: string, overId: string) => void
  onSelect: (next: Set<string>) => void
  onToggleDone: (row: Record_) => void
  onEdit: (row: Record_) => void
  onDelete: (row: Record_) => void
  onAdd: () => void
  onColumns: () => void
  onGroupDone: (done: boolean) => void
  onGroupDuplicate: () => void
  onGroupDelete: () => void
  onGroupSet: (key: string, value: string) => void
}

export function SheetView(props: Props) {
  const { sheet, fields, rows, accent, busy, readOnly = false, selected } = props

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    props.onMoveRow(String(active.id), String(over.id))
  }

  if (!fields.length) {
    return (
      <div className="hollow">
        <p>This sheet has no columns yet.</p>
        {!readOnly && (
          <button className="primary" onClick={props.onColumns}>
            Add a column
          </button>
        )}
      </div>
    )
  }

  if (!rows.length) {
    return (
      <div className="hollow">
        <p>No rows yet.</p>
        {!readOnly && (
          <button className="primary" onClick={props.onAdd}>
            + Add row
          </button>
        )}
      </div>
    )
  }

  const allSelected = rows.every((r) => selected.has(r.id))
  const chosenRows = rows.filter((r) => selected.has(r.id))

  function toggleAll() {
    const next = new Set(selected)
    // Only rows on screen, so search plus select-all cannot catch hidden rows.
    if (allSelected) rows.forEach((r) => next.delete(r.id))
    else rows.forEach((r) => next.add(r.id))
    props.onSelect(next)
  }

  return (
    <>
      {!readOnly && chosenRows.length > 0 && (
        <GroupBar
          count={chosenRows.length}
          sheet={sheet}
          fields={fields}
          busy={busy}
          onClear={() => props.onSelect(new Set())}
          onDone={props.onGroupDone}
          onDuplicate={props.onGroupDuplicate}
          onDelete={props.onGroupDelete}
          onSet={props.onGroupSet}
        />
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                {!readOnly && <th className="dragcol" />}
                <th className="gut">
                  {!readOnly && (
                    <input
                      type="checkbox"
                      checked={allSelected}
                      aria-label={allSelected ? 'Deselect all rows' : 'Select all rows'}
                      onChange={toggleAll}
                    />
                  )}
                </th>
                <th className="donecol" title={sheet.done_label}>
                  ✓
                </th>
                {fields.map((f) => (
                  <th key={f.id}>
                    {f.name}
                    {f.required && <span className="req">*</span>}
                    {CHOICE_TYPES.includes(f.type) && <span className="tmark">▾</span>}
                  </th>
                ))}
                {!readOnly && <th className="actcol" />}
              </tr>
            </thead>
            <SortableContext
              items={rows.map((row) => row.id)}
              strategy={verticalListSortingStrategy}
            >
              <tbody>
                {rows.map((row, index) => (
                  <SortableRow
                    key={row.id}
                    row={row}
                    index={index}
                    fields={fields}
                    sheet={sheet}
                    accent={accent}
                    picked={selected.has(row.id)}
                    selected={selected}
                    disabled={busy || !props.canReorder}
                    readOnly={readOnly}
                    onSelect={props.onSelect}
                    onToggleDone={props.onToggleDone}
                    onEdit={props.onEdit}
                    onDelete={props.onDelete}
                  />
                ))}
              </tbody>
            </SortableContext>
          </table>
        </div>
      </DndContext>
    </>
  )
}
