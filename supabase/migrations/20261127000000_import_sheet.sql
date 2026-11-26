-- ===========================================================================
-- import_sheet, import_rows — create a sheet from an uploaded .csv / .xlsx
--
-- The browser parses the file and sends rows in batches of at most 1,000, so
-- each request stays small and gets its own statement timeout:
--   import_sheet  creates the sheet, its columns, and the first batch of rows
--   import_rows   appends each further batch
-- Each call is one transaction. If a later batch fails, the app deletes the
-- sheet (fields and records cascade). Both are security invoker, so RLS
-- decides what the caller may write to, exactly as for hand-made sheets.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- import_sheet(workspace, name, fields, rows) → { sheet, fields }
-- p_fields: [{ key, name, type, options, is_title }, ...] in column order
-- p_rows:   [{ <key>: value, ... }, ...] in row order (the first batch)
-- ---------------------------------------------------------------------------
create or replace function public.import_sheet(
  p_workspace uuid,
  p_name      text,
  p_fields    jsonb,
  p_rows      jsonb
)
returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid;
begin
  if length(btrim(coalesce(p_name, ''))) = 0 then
    raise exception 'Give the sheet a name.';
  end if;
  if jsonb_typeof(p_fields) is distinct from 'array' or jsonb_array_length(p_fields) = 0 then
    raise exception 'The import has no columns.';
  end if;
  if jsonb_array_length(p_fields) > 100 then
    raise exception 'A sheet can have at most 100 columns.';
  end if;
  if p_rows is not null and jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Rows must be a list.';
  end if;
  if jsonb_array_length(coalesce(p_rows, '[]')) > 1000 then
    raise exception 'Send at most 1,000 rows at a time.';
  end if;
  -- RLS hides other people's workspaces, so this also covers "not yours".
  if not exists (select 1 from public.workspaces w where w.id = p_workspace) then
    raise exception 'That workspace no longer exists. Reload the page.';
  end if;

  insert into public.sheets (workspace_id, name, position)
  values (
    p_workspace,
    btrim(p_name),
    (select coalesce(max(x.position), 0) + 100 from public.sheets x where x.workspace_id = p_workspace)
  )
  returning id into v_id;

  -- Columns first: validate_cells checks each row against them.
  insert into public.fields (sheet_id, key, name, type, options, is_title, position)
  select v_id,
         e.value ->> 'key',
         e.value ->> 'name',
         e.value ->> 'type',
         coalesce(array(select jsonb_array_elements_text(e.value -> 'options')), '{}'),
         coalesce((e.value ->> 'is_title')::boolean, false),
         e.ord * 1000
    from jsonb_array_elements(p_fields) with ordinality as e(value, ord);

  insert into public.records (sheet_id, cells, position)
  select v_id, e.value, e.ord * 1000
    from jsonb_array_elements(coalesce(p_rows, '[]')) with ordinality as e(value, ord);

  return jsonb_build_object(
    'sheet', (select to_jsonb(s) from public.sheets s where s.id = v_id),
    'fields', (select jsonb_agg(to_jsonb(f) order by f.position)
                 from public.fields f where f.sheet_id = v_id)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- import_rows(sheet, rows, start) → rows inserted
-- p_start is how many rows earlier batches sent, so positions continue in order.
-- ---------------------------------------------------------------------------
create or replace function public.import_rows(p_sheet uuid, p_rows jsonb, p_start int)
returns int
language plpgsql security invoker set search_path = '' as $$
declare
  v_count int;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'Rows must be a list.';
  end if;
  if jsonb_array_length(p_rows) > 1000 then
    raise exception 'Send at most 1,000 rows at a time.';
  end if;
  if coalesce(p_start, -1) < 0 then
    raise exception 'The row offset must be zero or more.';
  end if;
  if not exists (select 1 from public.sheets s where s.id = p_sheet) then
    raise exception 'That sheet no longer exists. Reload the page.';
  end if;

  insert into public.records (sheet_id, cells, position)
  select p_sheet, e.value, (p_start + e.ord) * 1000
    from jsonb_array_elements(p_rows) with ordinality as e(value, ord);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.import_sheet(uuid, text, jsonb, jsonb) from public, anon;
revoke execute on function public.import_rows(uuid, jsonb, int)          from public, anon;
grant  execute on function public.import_sheet(uuid, text, jsonb, jsonb) to authenticated;
grant  execute on function public.import_rows(uuid, jsonb, int)          to authenticated;
