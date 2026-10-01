-- ===========================================================================
-- get_shared, hardened
--
--   * No internal ids. Sheets and records are identified by position ("n"),
--     columns by their key. A visitor learns nothing that names a row in the
--     database.
--   * Records come in pages: p_limit rows (at most 1000) starting at p_offset.
--     Without p_sheet, every sheet in the share returns its first page; with
--     p_sheet = n, only sheet n returns, with the requested page. Each sheet
--     carries its total and done counts, so the caller knows what is left.
--   * view_count / last_seen_at are written at most once a minute per link,
--     and only for the first page, so refreshing or paging cannot turn every
--     visit into a write. The count is approximate by design.
-- ===========================================================================

drop function if exists public.get_shared(text);

create or replace function public.get_shared(
  share_token text,
  p_sheet     int default null,
  p_offset    int default 0,
  p_limit     int default 500
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
declare
  s       record;
  v_off   int := greatest(coalesce(p_offset, 0), 0);
  v_lim   int := least(greatest(coalesce(p_limit, 500), 1), 1000);
  result  jsonb;
begin
  select * into s
    from public.shares
   where token = share_token
     and not revoked
     and (expires_at is null or expires_at > now());

  if not found then
    return null;
  end if;

  with shared as (
    select sh.*, (row_number() over (order by sh.position, sh.id) - 1)::int as n
      from public.sheets sh
     where (s.scope = 'sheet'     and sh.id = s.sheet_id)
        or (s.scope = 'workspace' and sh.workspace_id = s.workspace_id)
  )
  select jsonb_build_object(
    'scope', s.scope,
    'db_name', (select p.db_name from public.profiles p where p.id = s.owner_id),
    'title', case
               when s.scope = 'workspace'
                 then (select w.name from public.workspaces w where w.id = s.workspace_id)
               else (select sh.name from public.sheets sh where sh.id = s.sheet_id)
             end,
    'description', case
                     when s.scope = 'workspace'
                       then (select w.description from public.workspaces w
                              where w.id = s.workspace_id)
                     else (select sh.description from public.sheets sh
                            where sh.id = s.sheet_id)
                   end,
    'sheets', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'n', sh.n,
          'name', sh.name,
          'description', sh.description,
          'accent', sh.accent,
          'done_label', sh.done_label,
          'fields', coalesce((
            select jsonb_agg(
                     jsonb_build_object(
                       'key', f.key, 'name', f.name, 'type', f.type,
                       'options', f.options, 'is_title', f.is_title
                     ) order by f.position, f.id
                   )
              from public.fields f
             where f.sheet_id = sh.id
          ), '[]'::jsonb),
          'total', (select count(*) from public.records r where r.sheet_id = sh.id),
          'done',  (select count(*) from public.records r where r.sheet_id = sh.id and r.done),
          'offset', v_off,
          'records', coalesce((
            select jsonb_agg(
                     jsonb_build_object('n', page.n, 'cells', page.cells, 'done', page.done)
                     order by page.n
                   )
              -- row_number runs before OFFSET, so n is the row's place in
              -- the whole sheet, not in the page.
              from (select r.cells, r.done,
                           (row_number() over (order by r.position, r.id) - 1)::int as n
                      from public.records r
                     where r.sheet_id = sh.id
                     order by r.position, r.id
                     offset v_off limit v_lim) page
          ), '[]'::jsonb)
        ) order by sh.n
      ),
      '[]'::jsonb
    )
  ) into result
  from shared sh
  where p_sheet is null or sh.n = p_sheet;

  if p_sheet is null and v_off = 0 then
    update public.shares
       set view_count = view_count + 1,
           last_seen_at = now()
     where id = s.id
       and (last_seen_at is null or last_seen_at < now() - interval '1 minute');
  end if;

  return result;
end;
$$;

revoke execute on function public.get_shared(text, int, int, int) from public;
grant  execute on function public.get_shared(text, int, int, int) to anon, authenticated;
