// Reads a .csv or .xlsx file into plain tables. No Supabase, no React.
// The parser libraries are imported on demand so they stay out of the main bundle.

export const MAX_FILE_BYTES = 8 * 1024 * 1024
export const MAX_ROWS = 5000
export const MAX_COLUMNS = 100

export type RawCell = string | number | boolean | Date | null

export interface Table {
  headers: string[]
  rows: RawCell[][]
}

export interface Workbook {
  // Tab names in file order. A CSV has one tab, named after the file.
  tabs: string[]
  // Turns one tab into a table. Results are cached, so calling it twice is free.
  read(tab: string): Table
}

// Errors meant to be shown to the user as they are.
export class ImportError extends Error {}

export function fileKind(name: string): 'csv' | 'xlsx' | null {
  const ext = name.toLowerCase().split('.').pop()
  if (ext === 'csv') return 'csv'
  if (ext === 'xlsx') return 'xlsx'
  return null
}

export function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, '').trim() || 'Imported sheet'
}

export async function openFile(file: File): Promise<Workbook> {
  const kind = fileKind(file.name)
  if (!kind) {
    throw new ImportError(
      file.name.toLowerCase().endsWith('.xls')
        ? 'Old .xls files are not supported. Save it as .xlsx or .csv and try again.'
        : 'Choose a .csv or .xlsx file.',
    )
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new ImportError(
      'That file is over 8 MB. Split it into smaller files and import each one.',
    )
  }
  const raw = kind === 'csv' ? await readCsv(file) : await readXlsx(file)
  const cache = new Map<string, Table>()
  return {
    tabs: raw.map((t) => t.name),
    read(tab) {
      const hit = cache.get(tab)
      if (hit) return hit
      const found = raw.find((t) => t.name === tab)
      if (!found) throw new ImportError(`There is no tab called "${tab}".`)
      const table = toTable(found.data)
      cache.set(tab, table)
      return table
    },
  }
}

interface RawTab {
  name: string
  data: unknown[][]
}

async function readCsv(file: File): Promise<RawTab[]> {
  const { default: Papa } = await import('papaparse')
  const text = (await file.text()).replace(/^FEFF/, '')
  // Delimiter (comma, semicolon, tab, ...) is detected from the text.
  const result = Papa.parse<string[]>(text, { skipEmptyLines: 'greedy' })
  const fatal = result.errors.find((e) => e.type === 'Quotes')
  if (fatal) {
    throw new ImportError(
      `Row ${fatal.row ?? '?'} has an unclosed quote, so the file can't be read.`,
    )
  }
  return [{ name: baseName(file.name), data: result.data }]
}

const NOT_XLSX = "That file couldn't be read as a spreadsheet. Is it a real .xlsx file?"

// One unzip reads every tab; tables are built per tab later, on demand.
async function readXlsx(file: File): Promise<RawTab[]> {
  if (typeof Worker !== 'undefined') return readXlsxInWorker(file)
  // No Worker (tests, very old browsers): same reader, on this thread.
  const { default: readXlsxFile } = await import('read-excel-file/web-worker')
  try {
    const sheets = await readXlsxFile(file)
    return sheets.map((s) => ({ name: s.sheet, data: s.data as unknown[][] }))
  } catch {
    throw new ImportError(NOT_XLSX)
  }
}

function readXlsxInWorker(file: File): Promise<RawTab[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./xlsx.worker.ts', import.meta.url), { type: 'module' })
    const done = () => worker.terminate()
    worker.onmessage = (event: MessageEvent<{ ok: boolean; tabs?: RawTab[] }>) => {
      done()
      if (event.data.ok && event.data.tabs) resolve(event.data.tabs)
      else reject(new ImportError(NOT_XLSX))
    }
    worker.onerror = () => {
      done()
      reject(new ImportError(NOT_XLSX))
    }
    worker.postMessage(file)
  })
}

function clean(value: unknown): RawCell {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'boolean') return value
  const text = String(value).trim()
  return text === '' ? null : text
}

function headerText(value: RawCell): string {
  if (value === null) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value)
}

// First non-empty row is the header. Empty rows and empty unnamed columns are dropped.
export function toTable(data: unknown[][]): Table {
  const rows = data
    .map((row) => (Array.isArray(row) ? row.map(clean) : []))
    .filter((row) => row.some((c) => c !== null))
  if (rows.length === 0) return { headers: [], rows: [] }

  const [head, ...body] = rows
  const width = Math.max(...rows.map((r) => r.length))
  const keep: number[] = []
  for (let col = 0; col < width; col += 1) {
    const named = head[col] != null
    const used = body.some((r) => r[col] != null)
    if (named || used) keep.push(col)
  }

  if (keep.length > MAX_COLUMNS) {
    throw new ImportError(
      `This tab has ${keep.length} columns. The most a sheet can take is ${MAX_COLUMNS}.`,
    )
  }
  if (body.length > MAX_ROWS) {
    throw new ImportError(
      `This tab has ${body.length.toLocaleString()} rows. The most one import can take is ${MAX_ROWS.toLocaleString()}.`,
    )
  }

  return {
    headers: keep.map((col, i) => headerText(head[col] ?? null).trim() || `Column ${i + 1}`),
    rows: body.map((r) => keep.map((col) => r[col] ?? null)),
  }
}
