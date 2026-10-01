-- ===========================================================================
-- renumber_sheet grants
-- The baseline never revoked Supabase's default EXECUTE grants, so PUBLIC and anon could call it.
-- ===========================================================================

revoke execute on function public.renumber_sheet(uuid) from public, anon;
grant  execute on function public.renumber_sheet(uuid) to authenticated;
