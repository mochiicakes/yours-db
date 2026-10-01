import { describe, it, expect } from 'vitest'
import { arrayMove } from '@dnd-kit/sortable'
import { nextPosition, nextPositions, planMove, type Positioned } from './reorder'

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function rows(ids: string[]): Positioned[] {
  return ids.map((id, i) => ({ id, position: (i + 1) * 1000 }))
}

function sorted(items: Positioned[]): Positioned[] {
  return [...items].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
}

// Mirrors renumber_sheet: order by position, id; respace by 1000.
function renumber(items: Positioned[]): Positioned[] {
  return sorted(items).map((r, i) => ({ id: r.id, position: (i + 1) * 1000 }))
}

// Drop the way App.tsx does: plan, renumber and replan if asked, then write one position.
function drop(items: Positioned[], activeId: string, overId: string) {
  let current = sorted(items)
  let plan = planMove(current, activeId, overId)
  let renumbered = false
  if (plan?.kind === 'renumber') {
    current = renumber(current)
    renumbered = true
    plan = planMove(current, activeId, overId)
  }
  if (!plan || plan.kind !== 'one') throw new Error(`no position for ${activeId} → ${overId}`)
  const position = plan.position
  const next = current.map((r) => (r.id === activeId ? { ...r, position } : r))
  return { rows: sorted(next), renumbered }
}

const ids = (items: Positioned[]) => items.map((r) => r.id)

// ---------------------------------------------------------------------------
// planMove agrees with dnd-kit's arrayMove, which is what the UI shows
// ---------------------------------------------------------------------------

describe('planMove', () => {
  const start = ['A', 'B', 'C', 'D', 'E']
  const cases: [string, string, string][] = [
    ['A', 'B', 'down'],
    ['A', 'E', 'down'],
    ['B', 'D', 'down'],
    ['E', 'D', 'up'],
    ['E', 'A', 'up'],
    ['D', 'B', 'up'],
  ]

  for (const [active, over, dir] of cases) {
    it(`${active} → ${over} (${dir}) matches arrayMove`, () => {
      const expected = arrayMove(start, start.indexOf(active), start.indexOf(over))
      expect(ids(drop(rows(start), active, over).rows)).toEqual(expected)
    })
  }

  it('returns null for a drop onto itself or an unknown id', () => {
    expect(planMove(rows(start), 'A', 'A')).toBeNull()
    expect(planMove(rows(start), 'A', 'Z')).toBeNull()
  })

  it('survives 300 drops into one gap, renumbering when room runs out', () => {
    let current = rows(start)
    let renumbers = 0
    for (let i = 0; i < 300; i++) {
      // The last row dropped onto the second always lands in the same shrinking gap.
      const order = ids(current)
      const active = order[order.length - 1]
      const over = order[1]
      const expected = arrayMove(order, order.length - 1, 1)
      const result = drop(current, active, over)
      if (result.renumbered) renumbers += 1
      expect(ids(result.rows)).toEqual(expected)
      const positions = result.rows.map((r) => r.position)
      expect(new Set(positions).size).toBe(positions.length)
      current = result.rows
    }
    expect(renumbers).toBeGreaterThan(0)
  })
})

describe('nextPosition', () => {
  it('gives 1000 for an empty sheet', () => {
    expect(nextPosition([])).toBe(1000)
  })

  it('gives max + 1000 otherwise, whatever the order', () => {
    expect(
      nextPosition([
        { id: 'a', position: 3000 },
        { id: 'b', position: 1000 },
      ]),
    ).toBe(4000)
    expect(nextPosition([{ id: 'a', position: 1500.25 }])).toBe(2500.25)
  })

  it('matches the spacing renumber_sheet leaves', () => {
    const spaced = renumber(rows(['A', 'B', 'C']))
    expect(nextPosition(spaced)).toBe(spaced[spaced.length - 1].position + 1000)
  })

  it('handles sheets too large to spread into Math.max', () => {
    const big = Array.from({ length: 200_000 }, (_, i) => ({ id: String(i), position: i }))
    expect(nextPosition(big)).toBe(199_999 + 1000)
  })
})

describe('nextPositions', () => {
  it('gives each new row its own slot, 1000 apart, after the last row', () => {
    expect(nextPositions([{ id: 'a', position: 2000 }], 3)).toEqual([3000, 4000, 5000])
    expect(nextPositions([], 2)).toEqual([1000, 2000])
    expect(nextPositions([{ id: 'a', position: 2000 }], 0)).toEqual([])
  })
})
