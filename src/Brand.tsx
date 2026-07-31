/**
 * The name of a database, always drawn the same way: whatever you called it,
 * then a full stop in the accent colour, then "db".
 *
 * The `.db` is presentation, never data. Only the part you typed is stored, so
 * the suffix cannot be deleted by accident, typed twice, or drift out of sync
 * between the header and the settings screen.
 *
 * The period picks up `--accent`, which the theme system writes onto <html>, so
 * it recolours the instant you choose a different accent — no re-render needed.
 */
export function Brand({ name, className }: { name: string; className?: string }) {
  return (
    <span className={className ?? 'brand'}>
      {name}
      <span className="dot">.</span>
      db
    </span>
  )
}

/**
 * Strip a `.db` the user typed themselves, so "Second Brain.db" is stored as
 * "Second Brain" and never renders as "Second Brain.db.db".
 */
export function stripSuffix(input: string): string {
  return input.replace(/\s*\.\s*db\s*$/i, '').trim()
}
