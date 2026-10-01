-- ===========================================================================
-- sheet_counts — row and done totals per sheet
-- Rows load per sheet, so the sidebar gets its totals here. security invoker, so RLS applies.
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
