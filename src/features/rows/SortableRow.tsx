import type { CSSProperties } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Field, Record_, Sheet } from '../../db'
import { CellView } from './CellView'

export function SortableRow({
  row,
  index,
  fields,
  sheet,
  accent,
  picked,
  selected,
  disabled,
  readOnly,
  onSelect,
  onToggleDone,
  onEdit,
  onDelete,
}: {
  row: Record_
  index: number
  fields: Field[]
  sheet: Sheet
  accent: string
  picked: boolean
  selected: Set<string>
  disabled: boolean
  readOnly: boolean
  onSelect: (next: Set<string>) => void
  onToggleDone: (row: Record_) => void
  onEdit: (row: Record_) => void
  onDelete: (row: Record_) => void
}) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: row.id,
    // A viewer must not be able to start a drag.
    disabled: disabled || readOnly,
  })

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    position: 'relative',
    zIndex: isDragging ? 2 : undefined,
  }

  function toggleSelected() {
    const next = new Set(selected)
    if (next.has(row.id)) next.delete(row.id)
    else next.add(row.id)
    onSelect(next)
  }

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={[row.done ? 'done' : '', picked ? 'picked' : '', isDragging ? 'dragging' : '']
        .filter(Boolean)
        .join(' ')}
    >
      {!readOnly && (
        <td className="dragcol">
          <button
            ref={setActivatorNodeRef}
            type="button"
            className="drag-handle"
            aria-label={`Move row ${index + 1}`}
            disabled={disabled}
            {...attributes}
            {...listeners}
          >
            ⋮⋮
          </button>
        </td>
      )}

      <td className="gut">
        <span className="rownum">{index + 1}</span>
        {!readOnly && (
          <input
            type="checkbox"
            checked={picked}
            aria-label={`Select row ${index + 1}`}
            onChange={() => undefined}
            onClick={() => toggleSelected()}
          />
        )}
      </td>

      <td className="donecol">
        {readOnly ? (
          <span className={row.done ? 'bool yes' : 'bool no'}>{row.done ? '✓' : '–'}</span>
        ) : (
          <input
            type="checkbox"
            checked={row.done}
            aria-label={`${sheet.done_label}: row ${index + 1}`}
            onChange={() => onToggleDone(row)}
          />
        )}
      </td>

      {fields.map((field) => (
        <td key={field.id} className={`c-${field.type}`}>
          <CellView field={field} value={row.cells[field.key]} accent={accent} />
        </td>
      ))}

      {!readOnly && (
        <td className="actcol">
          <button aria-label={`Edit row ${index + 1}`} onClick={() => onEdit(row)}>
            Edit
          </button>
          <button
            className="ghost"
            aria-label={`Delete row ${index + 1}`}
            onClick={() => onDelete(row)}
          >
            ✕
          </button>
        </td>
      )}
    </tr>
  )
}
