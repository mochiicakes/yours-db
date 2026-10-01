-- ===========================================================================
-- sheet_counts — row and done totals per sheet
--
-- The app no longer downloads every row up front; it loads a sheet's rows when
-- the sheet is opened. The sidebar, sheet list and profile still need totals
-- for every sheet, and this returns just those numbers.
--
-- security invoker: RLS limits it to the caller's own records.
-- ===========================================================================

create or replace function public.sheet_counts()
returns table (sheet_id uuid, total int, done int)
language sql stable security invoker set search_path = '' as $$
  select r.sheet_id, count(*)::int, (count(*) filter (where r.done))::int
    from public.records r
   group by r.sheet_id;
$$;

revoke execute on function public.sheet_counts() from public, anon;
grant  execute on function public.sheet_counts() to authenticated;
