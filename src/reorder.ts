/**
 * Where a dragged row lands.
 *
 * Positions are `double precision`, spaced 1000 apart by renumber_sheet in
 * the database. A move writes one row: the dragged item takes the midpoint of
 * its two new neighbours. Nothing else is touched.
 *
 * Midpoints halve the gap each time, and a double holds about 15 significant
 * digits, so dropping repeatedly between the same pair eventually runs out of
 * room. When that happens this returns `{ kind: 'renumber' }` instead of a
 * position: the caller respaces the sheet server-side, then asks again.
 */

export interface Positioned {
  id: string
  position: number
}

export type MovePlan =
  /** Write this position to the dragged row. */
  | { kind: 'one'; position: number }
  /** No room left between the neighbours. Renumber first, then plan again. */
  | { kind: 'renumber' }

/** Two positions closer than this cannot be split again reliably. */
const MIN_GAP = 0.0001

/** Spacing renumber_sheet uses, and what a move past the end adds. */
const STEP = 1000

/**
 * Plan dropping `activeId` onto `overId`.
 *
 * `items` must be in display order, already sorted by position. Returns null
 * when there is nothing to do — same item, or either id missing from the list.
 */
export function planMove<T extends Positioned>(
  items: T[],
  activeId: string,
  overId: string,
): MovePlan | null {
  if (activeId === overId) return null

  const from = items.findIndex((i) => i.id === activeId)
  const onto = items.findIndex((i) => i.id === overId)
  if (from < 0 || onto < 0) return null

  // Neighbours are read from the list with the dragged row taken out.
  // Reading them from the original list is the classic off-by-one: moving one
  // slot down would pick the row itself as a neighbour.
  const rest = items.filter((i) => i.id !== activeId)
  const overAt = rest.findIndex((i) => i.id === overId)

  // Dragging downward lands after the row you dropped on; upward, before it.
  const at = from < onto ? overAt + 1 : overAt

  const before = at > 0 ? rest[at - 1] : null
  const after = at < rest.length ? rest[at] : null

  // Past the end: a clear step beyond the last row.
  if (before && !after) {
    return { kind: 'one', position: before.position + STEP }
  }

  // To the very top: half of whatever is currently first.
  if (!before && after) {
    const position = after.position / 2
    return position < MIN_GAP ? { kind: 'renumber' } : { kind: 'one', position }
  }

  // Only row in the sheet — nowhere to move it.
  if (!before || !after) return null

  const gap = after.position - before.position
  const position = before.position + gap / 2

  // The midpoint has to land strictly between the neighbours. When it does
  // not, the doubles have collapsed and only a renumber frees up room.
  if (gap < MIN_GAP || position <= before.position || position >= after.position) {
    return { kind: 'renumber' }
  }

  return { kind: 'one', position }
}

/** Position for a new row appended to the end of a sheet. */
export function nextPosition(items: Positioned[]): number {
  if (!items.length) return STEP
  return Math.max(...items.map((i) => i.position)) + STEP
}
