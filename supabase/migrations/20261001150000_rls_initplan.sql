-- ===========================================================================
-- RLS performance, and an unused index
--
-- `auth.uid()` in a policy is evaluated once per row. Wrapped as
-- `(select auth.uid())` Postgres evaluates it once per statement (an InitPlan)
-- and reuses the value. Same rules, same results; only the cost changes.
-- See https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
--
-- records_cells_idx (GIN on records.cells) is dropped: no query filters on
-- the contents of cells, and every write to a row paid to maintain it.
-- ===========================================================================

drop policy if exists "own profile"    on public.profiles;
drop policy if exists "own workspaces" on public.workspaces;
drop policy if exists "own sheets"     on public.sheets;
drop policy if exists "own fields"     on public.fields;
drop policy if exists "own records"    on public.records;
drop policy if exists "own shares"     on public.shares;

create policy "own profile" on public.profiles
  for all to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "own workspaces" on public.workspaces
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "own sheets" on public.sheets
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.workspaces w
                 where w.id = workspace_id and w.owner_id = (select auth.uid()))
  );

create policy "own fields" on public.fields
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.sheets s
                 where s.id = sheet_id and s.owner_id = (select auth.uid()))
  );

create policy "own records" on public.records
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.sheets s
                 where s.id = sheet_id and s.owner_id = (select auth.uid()))
  );

create policy "own shares" on public.shares
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    -- You may only create a link to a sheet or workspace you actually own.
    -- Without this, owner_id alone passes while sheet_id/workspace_id points
    -- at someone else's data, and get_shared (SECURITY DEFINER) would serve it.
    and (
      (scope = 'sheet' and exists (
        select 1 from public.sheets s
        where s.id = sheet_id and s.owner_id = (select auth.uid())
      ))
      or
      (scope = 'workspace' and exists (
        select 1 from public.workspaces w
        where w.id = workspace_id and w.owner_id = (select auth.uid())
      ))
    )
  );

drop index if exists public.records_cells_idx;
