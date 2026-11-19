-- ===========================================================================
-- yours.db — baseline schema
--
-- The whole database in one migration: `npx supabase db push`, or paste this
-- file into the Supabase SQL editor of an empty project and run it once.
-- Later changes go in new migration files; never edit this one once applied.
--
-- Model:
--   profiles    one per account: database name, onboarding, consent
--   workspaces  the top level; holds sheets that belong together
--   sheets      a table you designed
--   fields      its columns, each with a type
--   records     its rows; cell values live in one JSONB object per row
--   shares      public read-only links to a sheet or a workspace
-- ===========================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- profiles
-- One row per account, created by the app the first time you sign in.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  db_name         text not null default '',
  onboarded       boolean not null default false,
  -- Consent: when the user agreed to the Terms + Privacy Policy, and to which
  -- wording. Null means "has not agreed yet".
  terms_agreed_at timestamptz,
  terms_version   text,
  created_at      timestamptz not null default now(),

  constraint profiles_name_length check (length(db_name) <= 60)
);

-- ---------------------------------------------------------------------------
-- workspaces
-- ---------------------------------------------------------------------------
create table if not exists public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid()
                references auth.users (id) on delete cascade,
  name        text not null,
  description text not null default '',
  accent      text not null default '#fe4c01',
  position    double precision not null default 0,
  created_at  timestamptz not null default now(),

  constraint workspaces_name_not_blank check (length(btrim(name)) > 0),
  constraint workspaces_accent_hex check (accent ~ '^#[0-9a-fA-F]{6}$')
);

-- ---------------------------------------------------------------------------
-- sheets
-- ---------------------------------------------------------------------------
create table if not exists public.sheets (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid()
                 references auth.users (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name         text not null,
  description  text not null default '',
  accent       text not null default '#6d5efc',
  -- What ticking the built-in checklist column means: Done, Read, Packed.
  done_label   text not null default 'Done',
  position     double precision not null default 0,
  created_at   timestamptz not null default now(),

  constraint sheets_name_not_blank check (length(btrim(name)) > 0),
  constraint sheets_accent_hex check (accent ~ '^#[0-9a-fA-F]{6}$')
);

-- ---------------------------------------------------------------------------
-- fields — the columns of a sheet
-- ---------------------------------------------------------------------------
create table if not exists public.fields (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid()
               references auth.users (id) on delete cascade,
  sheet_id   uuid not null references public.sheets (id) on delete cascade,
  key        text not null,
  name       text not null,
  type       text not null default 'text'
               check (type in ('text', 'longtext', 'number', 'checkbox',
                               'date', 'select', 'multiselect', 'url')),
  options    text[] not null default '{}',
  required   boolean not null default false,
  -- Exactly one field per sheet is the row's headline.
  is_title   boolean not null default false,
  position   double precision not null default 0,
  created_at timestamptz not null default now(),

  constraint fields_key_per_sheet unique (sheet_id, key),
  constraint fields_key_format check (key ~ '^[a-z0-9_]+$'),
  constraint fields_name_not_blank check (length(btrim(name)) > 0),
  constraint fields_choices_need_options check (
    type not in ('select', 'multiselect') or cardinality(options) > 0
  )
);

create unique index if not exists fields_one_title_per_sheet
  on public.fields (sheet_id) where is_title;

-- ---------------------------------------------------------------------------
-- records — the rows
-- ---------------------------------------------------------------------------
create table if not exists public.records (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid()
               references auth.users (id) on delete cascade,
  sheet_id   uuid not null references public.sheets (id) on delete cascade,
  cells      jsonb not null default '{}'::jsonb,
  done       boolean not null default false,
  position   double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint records_cells_is_object check (jsonb_typeof(cells) = 'object')
);

create index if not exists workspaces_owner_pos_idx   on public.workspaces (owner_id, position);
create index if not exists sheets_workspace_pos_idx   on public.sheets (workspace_id, position);
create index if not exists fields_sheet_pos_idx       on public.fields (sheet_id, position);
create index if not exists records_owner_sheet_pos_idx
  on public.records (owner_id, sheet_id, position);

-- ---------------------------------------------------------------------------
-- shares — public read-only links to a sheet or a whole workspace
-- ---------------------------------------------------------------------------
create table if not exists public.shares (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid()
                 references auth.users (id) on delete cascade,
  token        text not null unique,
  scope        text not null check (scope in ('sheet', 'workspace')),
  sheet_id     uuid references public.sheets (id)     on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  label        text not null default '',
  revoked      boolean not null default false,
  expires_at   timestamptz,
  last_seen_at timestamptz,
  view_count   integer not null default 0,
  created_at   timestamptz not null default now(),

  -- A share points at exactly one thing, matching its scope.
  constraint shares_target_matches_scope check (
    (scope = 'sheet'     and sheet_id is not null and workspace_id is null) or
    (scope = 'workspace' and workspace_id is not null and sheet_id is null)
  )
);

create index if not exists shares_owner_idx
  on public.shares (owner_id, created_at desc);

-- ---------------------------------------------------------------------------
-- validate_cells
-- Cells are JSONB, so this trigger type-checks them against the sheet's fields on every write.
-- ---------------------------------------------------------------------------
create or replace function public.validate_cells()
returns trigger
language plpgsql
as $$
declare
  f      record;
  v      jsonb;
  known  text[] := '{}';
  stray  text;
  choice text;
begin
  for f in select key, name, type, options, required
             from public.fields where sheet_id = new.sheet_id
  loop
    known := known || f.key;
    v := new.cells -> f.key;

    -- Null, empty string and empty list all mean "not filled in".
    if v is null or jsonb_typeof(v) = 'null'
       or (jsonb_typeof(v) = 'string' and btrim(v #>> '{}') = '')
       or (jsonb_typeof(v) = 'array' and jsonb_array_length(v) = 0) then
      if f.required then
        raise exception '% is required.', f.name;
      end if;
      continue;
    end if;

    case f.type
      when 'number' then
        if jsonb_typeof(v) <> 'number' then
          raise exception '% must be a number.', f.name;
        end if;
      when 'checkbox' then
        if jsonb_typeof(v) <> 'boolean' then
          raise exception '% must be true or false.', f.name;
        end if;
      when 'date' then
        if jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' then
          raise exception '% must be a date (YYYY-MM-DD).', f.name;
        end if;
      when 'select' then
        if jsonb_typeof(v) <> 'string' or not ((v #>> '{}') = any (f.options)) then
          raise exception '% must be one of: %.', f.name, array_to_string(f.options, ', ');
        end if;
      when 'multiselect' then
        if jsonb_typeof(v) <> 'array' then
          raise exception '% must be a list of choices.', f.name;
        end if;
        for choice in select jsonb_array_elements_text(v) loop
          if not (choice = any (f.options)) then
            raise exception '% contains "%", which is not one of its choices.',
              f.name, choice;
          end if;
        end loop;
      when 'url' then
        if jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ '^https?://' then
          raise exception '% must start with http:// or https://', f.name;
        end if;
      else
        if jsonb_typeof(v) <> 'string' then
          raise exception '% must be text.', f.name;
        end if;
    end case;
  end loop;

  for stray in select jsonb_object_keys(new.cells) loop
    if not (stray = any (known)) then
      raise exception 'This sheet has no column called "%".', stray;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists records_validate on public.records;
create trigger records_validate
  before insert or update of cells, sheet_id on public.records
  for each row execute function public.validate_cells();

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists records_touch on public.records;
create trigger records_touch before update on public.records
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- prune_deleted_field
-- Deleting a column clears its key from every row, so validate_cells keeps accepting them.
-- ---------------------------------------------------------------------------
create or replace function public.prune_deleted_field()
returns trigger language plpgsql as $$
begin
  update public.records
     set cells = cells - old.key
   where sheet_id = old.sheet_id and cells ? old.key;
  return old;
end;
$$;

drop trigger if exists fields_prune on public.fields;
create trigger fields_prune after delete on public.fields
  for each row execute function public.prune_deleted_field();

-- ===========================================================================
-- Table access
-- New Supabase projects no longer grant this automatically; without it every
-- signed-in request fails with "permission denied". RLS (below) still decides
-- which rows each user reaches. anon has no policies, so it reads only
-- through get_shared().
-- ===========================================================================

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- ===========================================================================
-- Row Level Security
-- Each child table also checks that its parent belongs to you.
-- ===========================================================================

alter table public.profiles   enable row level security;
alter table public.workspaces enable row level security;
alter table public.sheets     enable row level security;
alter table public.fields     enable row level security;
alter table public.records    enable row level security;
alter table public.shares     enable row level security;

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

-- ---------------------------------------------------------------------------
-- renumber_sheet
-- Respaces a sheet's rows 1000 apart. security invoker, so RLS applies.
-- ---------------------------------------------------------------------------
create or replace function public.renumber_sheet(p_sheet_id uuid)
returns table (id uuid, "position" double precision)
language sql security invoker set search_path = '' as $$
  update public.records r set position = o.rn * 1000
    from (select x.id, row_number() over (order by x.position, x.id) as rn
            from public.records x where x.sheet_id = p_sheet_id) o
   where r.id = o.id returning r.id, r.position;
$$;

revoke execute on function public.renumber_sheet(uuid) from public, anon;
grant  execute on function public.renumber_sheet(uuid) to authenticated;

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

-- ===========================================================================
-- get_shared — the one thing an anonymous visitor may run
-- security definer, but returns only what one live share token points at.
-- No internal ids, records in pages of at most 1000, views written at most once a minute.
-- ===========================================================================

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
              -- row_number runs before OFFSET, so n is the row's place in the whole sheet.
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

-- ===========================================================================
-- Confirm it worked:
--
--   select tablename, rowsecurity from pg_tables
--    where schemaname = 'public' order by tablename;
--
-- Six rows (fields, profiles, records, shares, sheets, workspaces), every one
-- with rowsecurity = true.
-- ===========================================================================
