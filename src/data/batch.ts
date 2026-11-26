// Splits rows into request-sized batches. Pure, so it is tested without a client.

// import_sheet and import_rows refuse more than 1,000 rows per call.
export const BATCH_ROWS = 1000
// Keeps each request well under gateway body limits and the statement timeout.
export const BATCH_BYTES = 2 * 1024 * 1024

const encoder = new TextEncoder()

// Every batch has at least one row, even if that row alone is over the byte budget.
export function batchRows<T>(rows: T[], maxRows = BATCH_ROWS, maxBytes = BATCH_BYTES): T[][] {
  const batches: T[][] = []
  let current: T[] = []
  let bytes = 2 // the surrounding []
  for (const row of rows) {
    const size = encoder.encode(JSON.stringify(row)).length + 1 // plus a comma
    if (current.length > 0 && (current.length >= maxRows || bytes + size > maxBytes)) {
      batches.push(current)
      current = []
      bytes = 2
    }
    current.push(row)
    bytes += size
  }
  if (current.length > 0) batches.push(current)
  return batches
}
