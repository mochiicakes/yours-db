import { describe, it, expect } from 'vitest'
import { batchRows } from './batch'

describe('batchRows', () => {
  it('returns no batches for no rows', () => {
    expect(batchRows([])).toEqual([])
  })
  it('splits by row count and keeps order', () => {
    const rows = Array.from({ length: 2500 }, (_, i) => ({ n: i }))
    const batches = batchRows(rows)
    expect(batches.map((b) => b.length)).toEqual([1000, 1000, 500])
    expect(batches.flat()).toEqual(rows)
  })
  it('splits by size before the row count is reached', () => {
    const row = { t: 'x'.repeat(90) } // 100 bytes as JSON, plus a comma
    const batches = batchRows(Array(10).fill(row), 1000, 2 + 101 * 4)
    expect(batches.map((b) => b.length)).toEqual([4, 4, 2])
  })
  it('counts bytes, not characters, for non-ASCII text', () => {
    const row = { t: 'é'.repeat(10) } // 20 bytes of é
    expect(batchRows([row, row], 1000, 2 + 30 * 2).length).toBe(1)
    expect(batchRows([row, row], 1000, 2 + 20 * 2).length).toBe(2)
  })
  it('puts an oversized row in a batch of its own', () => {
    const big = { t: 'x'.repeat(500) }
    expect(batchRows([{ a: 1 }, big, { a: 2 }], 1000, 100).map((b) => b.length)).toEqual([1, 1, 1])
  })
})
