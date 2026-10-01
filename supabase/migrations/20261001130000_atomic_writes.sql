-- ===========================================================================
-- Atomic multi-step writes
-- security invoker, so RLS applies; empty search_path, so every name is schema-qualified.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- set_title_field — make one column the sheet's title
-- Clears the old title first, since a partial unique index allows one per sheet.
-- ---------------------------------------------------------------------------
create or replace function public.set_title_field(p_sheet uuid, p_field uuid)
returns void
language plpgsql security invoker set search_path = '' as $$
begin
  update public.fields set is_title = false
   where sheet_id = p_sheet and is_title and id <> p_field;

  update public.fields set is_title = true
   where id = p_field and sheet_id = p_sheet;

  if not found then
    raise exception 'That column no longer exists. Reload the sheet.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- move_field — put one column at a new position
-- Respaces the sheet's columns 1000 apart after the move and returns their positions.
-- ---------------------------------------------------------------------------
create or replace function public.move_field(p_field uuid, p_position float8)
returns table (id uuid, "position" double precision)
language plpgsql security invoker set search_path = '' as $$
declare
  v_sheet uuid;
begin
  update public.fields f set position = p_position
   where f.id = p_field
  returning f.sheet_id into v_sheet;

  if v_sheet is null then
    raise exception 'That column no longer exists. Reload the sheet.';
  end if;

  return query
  update public.fields f set position = o.rn * 1000
    from (select x.id, row_number() over (order by x.position, x.id) as rn
            from public.fields x where x.sheet_id = v_sheet) o
   where f.id = o.id
  returning f.id, f.position;
end;
$$;

-- ---------------------------------------------------------------------------
-- duplicate_sheet — copy a sheet, its columns, and optionally its rows
-- The copy goes at the end of the workspace, owned by the caller.
-- ---------------------------------------------------------------------------
create or replace function public.duplicate_sheet(p_source uuid, p_with_rows boolean)
returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid;
begin
  insert into public.sheets (workspace_id, name, description, accent, done_label, position)
  select s.workspace_id, s.name || ' copy', s.description, s.accent, s.done_label,
         (select coalesce(max(x.position), 0) + 100
            from public.sheets x where x.workspace_id = s.workspace_id)
    from public.sheets s
   where s.id = p_source
  returning id into v_id;

  if v_id is null then
    raise exception 'That sheet no longer exists. Reload the page.';
  end if;

  -- Columns first: validate_cells checks each copied row against them.
  insert into public.fields (sheet_id, key, name, type, options, required, is_title, position)
  select v_id, f.key, f.name, f.type, f.options, f.required, f.is_title, f.position
    from public.fields f
   where f.sheet_id = p_source;

  if p_with_rows then
    insert into public.records (sheet_id, cells, done, position)
    select v_id, r.cells, r.done, r.position
      from public.records r
     where r.sheet_id = p_source;
  end if;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- bulk_set — set one column to one value across many rows
-- One UPDATE, so if any row rejects the value no row changes. A null value clears the key.
-- ---------------------------------------------------------------------------
create or replace function public.bulk_set(p_ids uuid[], p_key text, p_value jsonb)
returns setof public.records
language sql security invoker set search_path = '' as $$
  update public.records
     set cells = case
                   when p_value is null then cells - p_key
                   else jsonb_set(cells, array[p_key], p_value)
                 end
   where id = any (p_ids)
  returning *;
$$;

-- Signed-in users only.
revoke execute on function public.set_title_field(uuid, uuid)        from public, anon;
revoke execute on function public.move_field(uuid, float8)            from public, anon;
revoke execute on function public.duplicate_sheet(uuid, boolean)      from public, anon;
revoke execute on function public.bulk_set(uuid[], text, jsonb)       from public, anon;
grant  execute on function public.set_title_field(uuid, uuid)        to authenticated;
grant  execute on function public.move_field(uuid, float8)            to authenticated;
grant  execute on function public.duplicate_sheet(uuid, boolean)      to authenticated;
grant  execute on function public.bulk_set(uuid[], text, jsonb)       to authenticated;
