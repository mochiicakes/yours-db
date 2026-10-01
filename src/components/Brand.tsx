// What you typed, an accent full stop, then "db". The .db is display only, never stored.
export function Brand({ name, className }: { name: string; className?: string }) {
  return (
    <span className={className ?? 'brand'}>
      {name}
      <span className="dot">.</span>
      db
    </span>
  )
}

// Strip a typed .db so it never renders as .db.db.
export function stripSuffix(input: string): string {
  return input.replace(/\s*\.\s*db\s*$/i, '').trim()
}
