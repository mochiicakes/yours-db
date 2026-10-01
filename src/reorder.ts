// A dragged row takes the midpoint of its new neighbours. When doubles run out of room, planMove asks for a renumber.
export interface Positioned {
  id: string
  position: number
}

export type MovePlan = { kind: 'one'; position: number } | { kind: 'renumber' }

// Gaps smaller than this cannot be split reliably.
const MIN_GAP = 0.0001

// The spacing renumber_sheet uses.
const STEP = 1000

// items must be sorted by position. Returns null when there is nothing to do.
export function planMove<T extends Positioned>(
  items: T[],
  activeId: string,
  overId: string,
): MovePlan | null {
  if (activeId === overId) return null

  const from = items.findIndex((i) => i.id === activeId)
  const onto = items.findIndex((i) => i.id === overId)
  if (from < 0 || onto < 0) return null

  // Read neighbours with the dragged row removed, or moving down one slot picks the row itself.
  const rest = items.filter((i) => i.id !== activeId)
  const overAt = rest.findIndex((i) => i.id === overId)

  // Dragging down lands after the target row; dragging up, before it.
  const at = from < onto ? overAt + 1 : overAt

  const before = at > 0 ? rest[at - 1] : null
  const after = at < rest.length ? rest[at] : null

  if (before && !after) {
    return { kind: 'one', position: before.position + STEP }
  }

  if (!before && after) {
    const position = after.position / 2
    return position < MIN_GAP ? { kind: 'renumber' } : { kind: 'one', position }
  }

  if (!before || !after) return null

  const gap = after.position - before.position
  const position = before.position + gap / 2

  // Collapsed doubles leave no room between neighbours; only a renumber helps.
  if (gap < MIN_GAP || position <= before.position || position >= after.position) {
    return { kind: 'renumber' }
  }

  return { kind: 'one', position }
}

// A loop, not Math.max(...spread), which overflows the stack on very large sheets.
export function nextPosition(items: Positioned[]): number {
  if (!items.length) return STEP
  let max = items[0].position
  for (const i of items) if (i.position > max) max = i.position
  return max + STEP
}

export function nextPositions(items: Positioned[], count: number): number[] {
  const first = nextPosition(items)
  return Array.from({ length: count }, (_, i) => first + i * STEP)
}
