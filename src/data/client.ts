import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_KEY

if (!url || !key) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_KEY. Copy .env.example to ' +
      '.env.local, fill in both values from Supabase → Settings → API Keys, ' +
      'then restart `npm run dev`.',
  )
}

// RLS decides what each request may touch.
export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

export function fail(what: string, error: { message: string } | null): never {
  throw new Error(`${what}: ${error?.message ?? 'unknown error'}`)
}

// Read from the local session, so no request. Only profiles need it; other tables default owner_id to auth.uid().
export async function userId(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  if (!data.session) throw new Error('You are signed out. Reload the page.')
  return data.session.user.id
}

// PostgREST caps a response at 1000 rows, so page until a short page comes back.
export async function fetchAll<T>(table: string, sheetId?: string): Promise<T[]> {
  const PAGE = 1000
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    let query = supabase.from(table).select('*')
    if (sheetId) query = query.eq('sheet_id', sheetId)
    const { data, error } = await query
      // id breaks position ties so rows cannot shift between pages.
      .order('position')
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) fail(`Could not load ${table}`, error)
    const batch = (data ?? []) as T[]
    out.push(...batch)
    if (batch.length < PAGE) break
  }
  return out
}
