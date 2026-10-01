-- ===========================================================================
-- RLS performance, and an unused index
-- (select auth.uid()) runs once per statement instead of once per row. records_cells_idx is dropped; nothing filters on cells.
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
    -- Only link to what you own: get_shared runs as definer and would serve it.
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
