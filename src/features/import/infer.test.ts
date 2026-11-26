import { describe, it, expect } from 'vitest'
import {
  inferType,
  convertCell,
  convertColumn,
  choiceOptions,
  planColumns,
  buildImport,
  rawText,
} from './infer'
import type { Table } from './parse'

const day = (iso: string) => new Date(`${iso}T00:00:00Z`)

describe('inferType', () => {
  it('falls back to text for an empty column', () => {
    expect(inferType([null, null])).toBe('text')
  })
  it('spots checkboxes from booleans and yes/no words, ignoring blanks', () => {
    expect(inferType([true, false, null])).toBe('checkbox')
    expect(inferType(['Yes', 'no', 'Y', 'FALSE'])).toBe('checkbox')
  })
  it('keeps 0/1 as numbers', () => {
    expect(inferType(['0', '1', '1'])).toBe('number')
  })
  it('spots numbers, including grouped and currency text', () => {
    expect(inferType([1, '2.5', '-3', '1,234.50', '$12', '-€ 4', '.5'])).toBe('number')
  })
  it('keeps leading-zero codes as text', () => {
    expect(inferType(['00123', '04567'])).toBe('text')
  })
  it('does not treat badly grouped numbers as numbers', () => {
    expect(inferType(['1,23'])).toBe('text')
  })
  it('spots dates from spreadsheet dates and ISO text only', () => {
    expect(inferType([day('2026-03-04'), '2026-01-31', '2026-02-01T10:00:00Z'])).toBe('date')
    expect(inferType(['03/04/2026'])).toBe('text')
    expect(inferType(['2026-02-30'])).toBe('text')
  })
  it('spots links', () => {
    expect(inferType(['https://a.dev', 'HTTP://b.dev/x'])).toBe('url')
    expect(inferType(['https://a.dev', 'www.b.dev'])).toBe('text')
  })
  it('spots choices: few distinct values that repeat', () => {
    expect(inferType(['Open', 'Done', 'Open', 'Done', 'Open'])).toBe('select')
  })
  it('does not make choices from too few rows or mostly unique values', () => {
    expect(inferType(['Open', 'Open', 'Done'])).toBe('text')
    expect(inferType(['a', 'b', 'c', 'd', 'a'])).toBe('text')
  })
  it('caps choices at 12 distinct values', () => {
    const values = Array.from({ length: 26 }, (_, i) => `v${i % 13}`)
    expect(inferType(values)).toBe('text')
    expect(inferType(values.filter((v) => v !== 'v12'))).toBe('select')
  })
  it('spots long text from length or line breaks', () => {
    expect(inferType(['short', 'x'.repeat(201)])).toBe('longtext')
    expect(inferType(['line one\nline two'])).toBe('longtext')
  })
})

describe('convertCell', () => {
  it('turns blanks into null for every type', () => {
    expect(convertCell('number', null)).toEqual({ ok: true, value: null })
    expect(convertCell('multiselect', ' , ')).toEqual({ ok: true, value: null })
  })
  it('converts each type to the shape the database checks', () => {
    expect(convertCell('number', '1,234.5')).toEqual({ ok: true, value: 1234.5 })
    expect(convertCell('checkbox', 'Yes')).toEqual({ ok: true, value: true })
    expect(convertCell('date', day('2026-03-04'))).toEqual({ ok: true, value: '2026-03-04' })
    expect(convertCell('url', 'HTTPS://a.dev')).toEqual({ ok: true, value: 'https://a.dev' })
    expect(convertCell('multiselect', 'a; b,c')).toEqual({ ok: true, value: ['a', 'b', 'c'] })
    expect(convertCell('text', 42)).toEqual({ ok: true, value: '42' })
    expect(convertCell('text', true)).toEqual({ ok: true, value: 'true' })
  })
  it('explains values that do not fit', () => {
    expect(convertCell('number', 'abc')).toEqual({ ok: false, message: '"abc" is not a number' })
    expect(convertCell('date', '03/04/2026')).toMatchObject({ ok: false })
  })
})

describe('rawText', () => {
  it('writes dates as YYYY-MM-DD and keeps a time when there is one', () => {
    expect(rawText(day('2026-03-04'))).toBe('2026-03-04')
    expect(rawText(new Date('2026-03-04T09:05:00Z'))).toBe('2026-03-04 09:05')
  })
})

describe('choiceOptions / convertColumn', () => {
  it('lists choices in first-seen order; multiple choice splits cells', () => {
    expect(choiceOptions('select', ['b', 'a', 'b', null])).toEqual(['b', 'a'])
    expect(choiceOptions('multiselect', ['x, y', 'y; z'])).toEqual(['x', 'y', 'z'])
  })
  it('counts problem cells and points at the first one', () => {
    const r = convertColumn('Qty', 'number', ['1', 'two', null, 'four'])
    expect(r.cells).toEqual([1, null, null, null])
    expect(r.problem).toEqual({ count: 2, row: 2, message: '"two" is not a number' })
  })
  it('flags a choice column with nothing to choose from', () => {
    expect(convertColumn('Tag', 'select', [null]).problem?.message).toMatch(/no values/)
  })
})

describe('planColumns / buildImport', () => {
  const table: Table = {
    headers: ['Age', 'Name', 'Name', 'Status', 'Notes'],
    rows: [
      [31, 'Ana', 'A', 'Open', null],
      [27, 'Ben', 'B', 'Done', null],
      [40, 'Cy', 'C', 'Open', null],
      [22, 'Di', 'D', 'Open', null],
      [null, null, null, null, null],
    ],
  }

  it('guesses a type per column and includes everything', () => {
    expect(planColumns(table).map((p) => p.type)).toEqual([
      'number',
      'text',
      'text',
      'select',
      'text',
    ])
  })

  it('builds unique keys, picks the first text column as title, and packs rows', () => {
    const built = buildImport(table, planColumns(table))
    expect(built.fields.map((f) => [f.key, f.is_title])).toEqual([
      ['age', false],
      ['name', true],
      ['name_2', false],
      ['status', false],
      ['notes', false],
    ])
    expect(built.fields[3].options).toEqual(['Open', 'Done'])
    // The all-blank row is dropped; blank cells are left out.
    expect(built.rows).toHaveLength(4)
    expect(built.rows[0]).toEqual({ age: 31, name: 'Ana', name_2: 'A', status: 'Open' })
    expect(built.problems.every((p) => p === null)).toBe(true)
  })

  it('leaves out excluded columns and renames blank names', () => {
    const plans = planColumns(table).map((p, i) => ({
      ...p,
      include: i < 2,
      name: i === 1 ? ' ' : p.name,
    }))
    const built = buildImport(table, plans)
    expect(built.fields.map((f) => f.name)).toEqual(['Age', 'Column 2'])
    expect(built.fields[1].is_title).toBe(true)
  })

  it('falls back to the first included column for the title', () => {
    const plans = planColumns(table).map((p, i) => ({ ...p, include: i === 0 || i === 3 }))
    expect(buildImport(table, plans).fields.map((f) => f.is_title)).toEqual([true, false])
  })

  it('reports problems at the column they belong to', () => {
    const plans = planColumns(table)
    plans[1] = { ...plans[1], type: 'number' }
    const built = buildImport(table, plans)
    expect(built.problems[1]).toMatchObject({ count: 4, row: 1 })
    expect(built.problems[0]).toBeNull()
  })
})
