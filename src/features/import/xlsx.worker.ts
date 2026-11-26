// Reads an .xlsx file off the main thread. Unzipping and XML parsing a large
// workbook takes hundreds of milliseconds, which would freeze the dialog.
import readXlsxFile from 'read-excel-file/web-worker'

self.onmessage = async (event: MessageEvent<File>) => {
  try {
    const sheets = await readXlsxFile(event.data)
    self.postMessage({ ok: true, tabs: sheets.map((s) => ({ name: s.sheet, data: s.data })) })
  } catch {
    self.postMessage({ ok: false })
  }
}
