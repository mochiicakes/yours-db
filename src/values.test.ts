import { describe, it, expect } from 'vitest'
import {
  coerce,
  checkCell,
  packCells,
  rowTitle,
  rowSearchText,
  toKey,
  isBlank,
  blankCell,
  cellText,
  checkRow,
  type Field,
  type Record_,
} from './values'

// ---------------------------------------------------------------------------
// tiny factories so each test states only what it cares about
// ---------------------------------------------------------------------------

function field(partial: Partial<Field>): Field {
  return {
    id: 'f1',
    owner_id: '',
    sheet_id: 's1',
    key: 'k',
    name: 'Field',
    type: 'text',
    options: [],
    required: false,
    is_title: false,
    position: 0,
    created_at: '',
    ...partial,
  }
}

function record(cells: Record_['cells']): Record_ {
  return {
    id: 'r1',
    owner_id: '',
    sheet_id: 's1',
    cells,
    done: false,
    position: 0,
    created_at: '',
    updated_at: '',
  }
}

// ---------------------------------------------------------------------------
// isBlank — the case that bites: 0 and false are values, not blanks
// ---------------------------------------------------------------------------

describe('isBlank', () => {
  it('treats 0 and false as values, not blanks', () => {
    expect(isBlank(0)).toBe(false)
    expect(isBlank(false)).toBe(false)
  })
  it('treats null, empty string, whitespace and empty array as blank', () => {
    expect(isBlank(null)).toBe(true)
    expect(isBlank('')).toBe(true)
    expect(isBlank('   ')).toBe(true)
    expect(isBlank([])).toBe(true)
  })
  it('treats a non-empty string and non-empty array as not blank', () => {
    expect(isBlank('x')).toBe(false)
    expect(isBlank(['a'])).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// blankCell — the right empty shape per type
// ---------------------------------------------------------------------------

describe('blankCell', () => {
  it('gives false for checkbox, [] for multiselect, null for number, "" otherwise', () => {
    expect(blankCell(field({ type: 'checkbox' }))).toBe(false)
    expect(blankCell(field({ type: 'multiselect' }))).toEqual([])
    expect(blankCell(field({ type: 'number' }))).toBeNull()
    expect(blankCell(field({ type: 'text' }))).toBe('')
    expect(blankCell(field({ type: 'url' }))).toBe('')
  })
})

// ---------------------------------------------------------------------------
// coerce — strings from inputs become the shape the database expects
// ---------------------------------------------------------------------------

describe('coerce', () => {
  it('turns a numeric string into a number', () => {
    expect(coerce(field({ type: 'number' }), '42')).toBe(42)
  })
  it('keeps 0 as a number rather than treating it as empty', () => {
    expect(coerce(field({ type: 'number' }), '0')).toBe(0)
  })
  it('returns null for an unparseable number, never NaN', () => {
    expect(coerce(field({ type: 'number' }), 'abc')).toBeNull()
    expect(coerce(field({ type: 'number' }), '')).toBeNull()
  })
  it('coerces checkbox to a real boolean', () => {
    expect(coerce(field({ type: 'checkbox' }), true)).toBe(true)
    expect(coerce(field({ type: 'checkbox' }), '')).toBe(false)
    expect(coerce(field({ type: 'checkbox' }), 'on')).toBe(true)
  })
  it('coerces multiselect to an array of strings, or [] for non-arrays', () => {
    expect(coerce(field({ type: 'multiselect' }), ['a', 'b'])).toEqual(['a', 'b'])
    expect(coerce(field({ type: 'multiselect' }), [1, 2])).toEqual(['1', '2'])
    expect(coerce(field({ type: 'multiselect' }), 'nope')).toEqual([])
  })
  it('stringifies anything else for text', () => {
    expect(coerce(field({ type: 'text' }), 123)).toBe('123')
    expect(coerce(field({ type: 'text' }), null)).toBe('')
  })
})

// ---------------------------------------------------------------------------
// checkCell — mirrors the validate_cells trigger
// ---------------------------------------------------------------------------

describe('checkCell', () => {
  it('requires a value only when the field is required', () => {
    expect(checkCell(field({ required: true }), '')).toMatch(/required/)
    expect(checkCell(field({ required: false }), '')).toBeNull()
  })
  it('accepts a valid number and rejects a non-number', () => {
    expect(checkCell(field({ type: 'number' }), 5)).toBeNull()
    expect(checkCell(field({ type: 'number' }), 'five')).toMatch(/must be a number/)
  })
  it('rejects a select value not in its options', () => {
    const f = field({ type: 'select', options: ['red', 'blue'] })
    expect(checkCell(f, 'green')).toMatch(/must be one of/)
    expect(checkCell(f, 'red')).toBeNull()
  })
  it('rejects a multiselect containing a value not in its options', () => {
    const f = field({ type: 'multiselect', options: ['a', 'b'] })
    expect(checkCell(f, ['a', 'z'])).toMatch(/"z"/)
    expect(checkCell(f, ['a', 'b'])).toBeNull()
  })
  it('rejects a url without an http(s) scheme', () => {
    const f = field({ type: 'url' })
    expect(checkCell(f, 'example.com')).toMatch(/http/)
    expect(checkCell(f, 'https://example.com')).toBeNull()
  })
  it('checks date shape only, matching the trigger', () => {
    const f = field({ type: 'date' })
    // Format-only: a well-shaped but impossible date passes; a non-date fails.
    expect(checkCell(f, 'yesterday')).toMatch(/date/)
    expect(checkCell(f, '2026-02-14')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// checkRow — collects every field's error
// ---------------------------------------------------------------------------

describe('checkRow', () => {
  it('returns no errors when every field is valid', () => {
    const fields = [
      field({ key: 'n', name: 'Count', type: 'number' }),
      field({ key: 'u', name: 'Site', type: 'url' }),
    ]
    expect(checkRow(fields, { n: 5, u: 'https://x.com' })).toEqual([])
  })
  it('collects a message per invalid field', () => {
    // Number field is REQUIRED: coerce turns 'nope' into null, and a required
    // null is an error — so both this and the bad url fire. (A non-required
    // number would coerce the garbage to null and pass as "not filled in".)
    const fields = [
      field({ key: 'n', name: 'Count', type: 'number', required: true }),
      field({ key: 'u', name: 'Site', type: 'url' }),
    ]
    expect(checkRow(fields, { n: 'nope', u: 'x.com' })).toHaveLength(2)
  })
  it('a non-required number given garbage coerces to blank and passes', () => {
    const fields = [field({ key: 'n', name: 'Count', type: 'number' })]
    expect(checkRow(fields, { n: 'nope' })).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// packCells — "not filled in" is one state, not two
// ---------------------------------------------------------------------------

describe('packCells', () => {
  it('strips blanks', () => {
    const fields = [field({ key: 'a', type: 'text' }), field({ key: 'b', type: 'number' })]
    const out = packCells(fields, { a: '', b: 5 })
    expect(out).toEqual({ b: 5 })
    expect('a' in out).toBe(false)
  })
  it('keeps 0 and false rather than stripping them', () => {
    const fields = [field({ key: 'n', type: 'number' }), field({ key: 'c', type: 'checkbox' })]
    expect(packCells(fields, { n: 0, c: false })).toEqual({ n: 0, c: false })
  })
  it('only includes keys that belong to the given fields', () => {
    const fields = [field({ key: 'a', type: 'text' })]
    // A stray key the sheet has no column for must not survive packing.
    expect(packCells(fields, { a: 'x', ghost: 'y' })).toEqual({ a: 'x' })
  })
})

// ---------------------------------------------------------------------------
// cellText — flattening for display and search
// ---------------------------------------------------------------------------

describe('cellText', () => {
  it('joins arrays, renders booleans as yes/no, and blanks null', () => {
    expect(cellText(['a', 'b'])).toBe('a, b')
    expect(cellText(true)).toBe('yes')
    expect(cellText(false)).toBe('no')
    expect(cellText(null)).toBe('')
    expect(cellText(42)).toBe('42')
  })
})

// ---------------------------------------------------------------------------
// rowTitle — the row's headline
// ---------------------------------------------------------------------------

describe('rowTitle', () => {
  it('uses the title field when one is marked', () => {
    const fields = [field({ key: 'name', is_title: true }), field({ key: 'other' })]
    expect(rowTitle(fields, record({ name: 'Hello', other: 'x' }))).toBe('Hello')
  })
  it('falls back to the first field when no title is marked', () => {
    const fields = [field({ key: 'first' }), field({ key: 'second' })]
    expect(rowTitle(fields, record({ first: 'A', second: 'B' }))).toBe('A')
  })
  it('falls back to "Untitled" when the title cell is empty', () => {
    const fields = [field({ key: 'name', is_title: true })]
    expect(rowTitle(fields, record({ name: '' }))).toBe('Untitled')
  })
})

// ---------------------------------------------------------------------------
// rowSearchText — everything, lowercased, in one string
// ---------------------------------------------------------------------------

describe('rowSearchText', () => {
  it('flattens every cell to lowercase searchable text', () => {
    const fields = [field({ key: 'a' }), field({ key: 'b', type: 'multiselect' })]
    const text = rowSearchText(fields, record({ a: 'Hello', b: ['Foo', 'Bar'] }))
    expect(text).toContain('hello')
    expect(text).toContain('foo')
    expect(text).toContain('bar')
  })
})

// ---------------------------------------------------------------------------
// toKey — stable column keys matching the db constraint ^[a-z0-9_]+$
// ---------------------------------------------------------------------------

describe('toKey', () => {
  it('produces a key matching the database constraint even from unicode', () => {
    expect(toKey('Ünïcödé Näme', [])).toBe('unicode_name')
  })
  it('falls back to "field" for a name with no latin letters', () => {
    expect(toKey('日本語', [])).toBe('field')
  })
  it('suffixes a duplicate instead of colliding', () => {
    expect(toKey('Name', ['name'])).toBe('name_2')
    expect(toKey('Name', ['name', 'name_2'])).toBe('name_3')
  })
  it('falls back to "field" when a name reduces to nothing', () => {
    expect(toKey('!!!', [])).toBe('field')
  })
  it('caps length at 40 characters', () => {
    const key = toKey('a'.repeat(100), [])
    expect(key.length).toBeLessThanOrEqual(40)
  })
})
