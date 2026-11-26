import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { openFile, toTable, fileKind, baseName, ImportError, MAX_ROWS } from './parse'

function csv(text: string, name = 'people.csv'): File {
  return new File([text], name, { type: 'text/csv' })
}

// tabs.xlsx was made with openpyxl: "People" (typed cells, one blank row),
// "Empty", and "Notes" (blank first row, an unnamed column that has data).
function fixture(): File {
  const bytes = readFileSync(new URL('./fixtures/tabs.xlsx', import.meta.url))
  return new File([bytes], 'tabs.xlsx')
}

describe('fileKind / baseName', () => {
  it('accepts .csv and .xlsx in any case', () => {
    expect(fileKind('a.CSV')).toBe('csv')
    expect(fileKind('b.xlsx')).toBe('xlsx')
    expect(fileKind('c.xls')).toBeNull()
    expect(fileKind('d.txt')).toBeNull()
  })
  it('drops the extension for the default sheet name', () => {
    expect(baseName('Q3 budget.xlsx')).toBe('Q3 budget')
    expect(baseName('.csv')).toBe('Imported sheet')
  })
})

describe('toTable', () => {
  it('uses the first non-empty row as headers and pads short rows', () => {
    const t = toTable([[], ['Name', 'Age'], ['Ana'], [null, null], ['Ben', 4]])
    expect(t.headers).toEqual(['Name', 'Age'])
    expect(t.rows).toEqual([
      ['Ana', null],
      ['Ben', 4],
    ])
  })
  it('trims text and treats blank text as empty', () => {
    expect(toTable([['A'], ['  x  '], ['   ']]).rows).toEqual([['x']])
  })
  it('names blank headers and drops columns with no header and no data', () => {
    const t = toTable([
      ['A', null, null, 'D'],
      [1, 2, null, 4],
    ])
    expect(t.headers).toEqual(['A', 'Column 2', 'D'])
    expect(t.rows).toEqual([[1, 2, 4]])
  })
  it('returns an empty table for an empty tab', () => {
    expect(toTable([[null], []])).toEqual({ headers: [], rows: [] })
  })
  it('refuses too many rows', () => {
    const data = [['A'], ...Array.from({ length: MAX_ROWS + 1 }, (_, i) => [i])]
    expect(() => toTable(data)).toThrow(ImportError)
  })
})

describe('openFile: csv', () => {
  it('reads a comma file as one tab named after the file', async () => {
    const wb = await openFile(csv('Name,Age\nAna,31\n\nBen,27\n'))
    expect(wb.tabs).toEqual(['people'])
    expect(wb.read('people')).toEqual({
      headers: ['Name', 'Age'],
      rows: [
        ['Ana', '31'],
        ['Ben', '27'],
      ],
    })
  })
  it('detects semicolons, strips a BOM and keeps quoted commas', async () => {
    const wb = await openFile(csv('FEFFName;Note\r\n"Ana";"a, b"\r\n'))
    expect(wb.read('people')).toEqual({ headers: ['Name', 'Note'], rows: [['Ana', 'a, b']] })
  })
  it('rejects other file types with a clear message', async () => {
    await expect(openFile(csv('x', 'old.xls'))).rejects.toThrow(/\.xls files are not supported/)
    await expect(openFile(csv('x', 'notes.txt'))).rejects.toThrow(/\.csv or \.xlsx/)
  })
  it('rejects files over 5 MB before reading them', async () => {
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.csv')
    await expect(openFile(big)).rejects.toThrow(/over 5 MB/)
  })
})

describe('openFile: xlsx', () => {
  it('lists every tab in file order', async () => {
    const wb = await openFile(fixture())
    expect(wb.tabs).toEqual(['People', 'Empty', 'Notes'])
  })
  it('keeps typed cells: numbers, booleans and dates', async () => {
    const t = (await openFile(fixture())).read('People')
    expect(t.headers).toEqual(['Name', 'Age', 'Joined', 'Active', 'Site'])
    expect(t.rows).toHaveLength(2)
    const [ana, ben] = t.rows
    expect(ana.slice(0, 2)).toEqual(['Ana', 31])
    expect(ana[2]).toBeInstanceOf(Date)
    expect((ana[2] as Date).toISOString().slice(0, 10)).toBe('2026-03-04')
    expect(ana[3]).toBe(true)
    expect(ben[1]).toBe(27.5)
    expect(ben[4]).toBeNull()
  })
  it('handles an empty tab and a tab with a blank first row', async () => {
    const wb = await openFile(fixture())
    expect(wb.read('Empty')).toEqual({ headers: [], rows: [] })
    expect(wb.read('Notes')).toEqual({
      headers: ['Topic', 'Column 2', 'Detail'],
      rows: [['Launch', 'x', null]],
    })
  })
  it('caches each tab', async () => {
    const wb = await openFile(fixture())
    expect(wb.read('People')).toBe(wb.read('People'))
  })
  it('rejects a file that is not really xlsx', async () => {
    await expect(openFile(new File(['nope'], 'fake.xlsx'))).rejects.toThrow(/couldn't be read/)
  })
})
