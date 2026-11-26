import { describe, it, expect } from 'vitest'
import {
  openDrafts,
  setTicked,
  setColumn,
  problemCount,
  tabIssue,
  importIssue,
  toJob,
  MAX_TABS,
} from './drafts'
import { ImportError, type Table, type Workbook } from './parse'

function workbook(tabs: Record<string, Table | Error>): Workbook {
  return {
    tabs: Object.keys(tabs),
    read(tab) {
      const t = tabs[tab]
      if (t instanceof Error) throw t
      return t
    },
  }
}

const people: Table = {
  headers: ['Name', 'Age'],
  rows: [
    ['Ana', '31'],
    ['Ben', 'unknown'],
  ],
}

describe('openDrafts', () => {
  it('ticks usable tabs, guesses their types, and explains the rest', () => {
    const drafts = openDrafts(
      workbook({
        People: people,
        Blank: { headers: [], rows: [] },
        Huge: new ImportError('This tab has 9,000 rows.'),
      }),
    )
    expect(drafts.map((d) => [d.tab, d.ticked, d.error])).toEqual([
      ['People', true, null],
      ['Blank', false, 'This tab is empty.'],
      ['Huge', false, 'This tab has 9,000 rows.'],
    ])
    expect(drafts[0].plans?.map((p) => p.type)).toEqual(['text', 'text'])
    expect(drafts[0].name).toBe('People')
  })

  it(`ticks at most ${MAX_TABS} tabs`, () => {
    const tabs = Object.fromEntries(
      Array.from({ length: MAX_TABS + 2 }, (_, i) => [`T${i}`, people]),
    )
    const drafts = openDrafts(workbook(tabs))
    expect(drafts.filter((d) => d.ticked)).toHaveLength(MAX_TABS)
    expect(drafts[MAX_TABS].plans).toBeNull()
  })

  it('lets real errors through', () => {
    expect(() => openDrafts(workbook({ Bad: new TypeError('bug') }))).toThrow(TypeError)
  })
})

describe('setTicked / setColumn', () => {
  it('guesses types the first time a tab is ticked', () => {
    const tabs = Object.fromEntries(
      Array.from({ length: MAX_TABS + 1 }, (_, i) => [`T${i}`, people]),
    )
    const last = openDrafts(workbook(tabs))[MAX_TABS]
    expect(setTicked(last, true).plans).not.toBeNull()
  })

  it('cannot tick a tab with an error', () => {
    const [blank] = openDrafts(workbook({ Blank: { headers: [], rows: [] } }))
    expect(setTicked(blank, true).ticked).toBe(false)
  })

  it('re-checks a column only when its type changes', () => {
    const [d] = openDrafts(workbook({ People: people }))
    const asNumber = setColumn(d, 1, { type: 'number' })
    expect(asNumber.results![1].problem).toMatchObject({ count: 1, row: 2 })
    expect(asNumber.results![0]).toBe(d.results![0])

    const renamed = setColumn(asNumber, 1, { name: 'Years' })
    expect(renamed.results).toBe(asNumber.results)
    expect(renamed.plans![1].name).toBe('Years')
  })
})

describe('issues', () => {
  const [d] = openDrafts(workbook({ People: people }))
  const broken = setColumn(d, 1, { type: 'number' })

  it('counts problems in included columns only', () => {
    expect(problemCount(broken)).toBe(1)
    expect(problemCount(setColumn(broken, 1, { include: false }))).toBe(0)
  })

  it('explains what blocks a tab', () => {
    expect(tabIssue(d)).toBeNull()
    expect(tabIssue(broken)).toBe('1 cell does not fit its column type.')
    expect(tabIssue({ ...d, name: '  ' })).toBe('Give the sheet a name.')
    const none = setColumn(setColumn(d, 0, { include: false }), 1, { include: false })
    expect(tabIssue(none)).toBe('Include at least one column.')
  })

  it('explains what blocks the import, naming the tab when there are several', () => {
    expect(importIssue([{ ...d, ticked: false }])).toBe('Tick at least one tab to import.')
    expect(importIssue([broken])).toBe('1 cell does not fit its column type.')
    expect(importIssue([d, { ...broken, tab: 'Sales' }])).toBe(
      'Sales: 1 cell does not fit its column type.',
    )
    expect(importIssue([d, { ...broken, ticked: false }])).toBeNull()
  })
})

describe('toJob', () => {
  it('builds the payload with the trimmed sheet name', () => {
    const [d] = openDrafts(workbook({ People: people }))
    const job = toJob({ ...d, name: '  Team  ' })
    expect(job.name).toBe('Team')
    expect(job.fields.map((f) => f.key)).toEqual(['name', 'age'])
    expect(job.rows).toEqual([
      { name: 'Ana', age: '31' },
      { name: 'Ben', age: 'unknown' },
    ])
  })
})
