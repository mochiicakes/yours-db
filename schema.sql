-- ===========================================================================
-- yours.db — complete database setup
--
-- Paste this entire file into the Supabase SQL editor and run it. Once.
-- Safe to run again: every statement is guarded.
--
-- Supabase will warn about "destructive operations" and "tables without RLS".
-- Both are expected. The destructive lines are `drop trigger if exists` guards
-- so this file can be re-run, and Row Level Security is switched on at the
-- bottom of this same file. Choose "Run and enable RLS" — it is fail-closed
-- and cannot conflict with anything here.
--
-- Model:
--   profile     one per account: what you named your database
--   workspace   the top level; holds sheets that belong together
--   sheet       a table you designed
--   fields      its columns, each with a type
--   records     its rows; cell values live in one JSONB object per row
-- ===========================================================================

-- If you ever ran an earlier version of this app, clear it out first. These
-- tables are not part of this schema, and leaving one behind means the
-- `create table if not exists` statements below could silently skip a table
-- whose shape is wrong. Run these three lines once, then carry on.
--
--   drop table if exists public.records     cascade;
--   drop table if exists public.fields      cascade;
--   drop table if exists public.sheets      cascade;
--   drop table if exists public.workspaces  cascade;
--   drop table if exists public.projects    cascade;
--   drop table if exists public.items       cascade;
--   drop table if exists public.collections cascade;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- profiles
-- One row per account, created by the app the first time you sign in. Holds
-- what you decided to call your database and whether onboarding is done.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  db_name    text not null default '',
  onboarded  boolean not null default false,
  created_at timestamptz not null default now(),

  constraint profiles_name_length check (length(db_name) <= 60)
);

-- ---------------------------------------------------------------------------
-- workspaces
-- The top level. One per subject, client, or side of your life.
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
  -- What the built-in checklist column means here: Done / Read / Packed.
  done_label   text not null default 'Done',
  position     double precision not null default 0,
  created_at   timestamptz not null default now(),

  constraint sheets_name_not_blank check (length(btrim(name)) > 0),
  constraint sheets_accent_hex check (accent ~ '^#[0-9a-fA-F]{6}$')
);

-- ---------------------------------------------------------------------------
-- fields — the columns of a sheet
--
--   key      stable id used inside records.cells. Renaming a column never
--            touches a single row, because the key does not change.
--   type     decides the input, the cell rendering and the validation.
--   options  the choices, for select and multiselect.
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
create index if not exists records_cells_idx on public.records using gin (cells);

-- ---------------------------------------------------------------------------
-- validate_cells
--
-- Because you decide the columns at runtime, cell values live in JSONB and
-- Postgres cannot type-check them the way it checks a real column. This trigger
-- buys that back: it reads the sheet's field definitions on every write and
-- rejects anything that does not fit, including values for columns that do not
-- exist. It is why the browser is not the only thing deciding what valid data
-- looks like.
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

    -- null, empty string and empty list all mean "not filled in"
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
      else -- text, longtext
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
-- Deleting a column clears its data from every row, so the "unknown column"
-- rule above cannot start rejecting rows that were valid a moment ago.
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
-- Row Level Security
--
-- The whole security model. The key the browser holds is public by design, so
-- nothing here can rely on the client behaving. These policies run inside
-- Postgres on every query: a signed-in user reaches only their own rows, even
-- if someone calls the API directly with curl.
--
-- Each child table also confirms its parent belongs to you, so nothing can be
-- filed inside somebody else's project, workspace or sheet.
-- ===========================================================================

alter table public.profiles   enable row level security;
alter table public.workspaces enable row level security;
alter table public.sheets     enable row level security;
alter table public.fields     enable row level security;
alter table public.records    enable row level security;

drop policy if exists "own profile"    on public.profiles;
drop policy if exists "own workspaces" on public.workspaces;
drop policy if exists "own sheets"     on public.sheets;
drop policy if exists "own fields"     on public.fields;
drop policy if exists "own records"    on public.records;

create policy "own profile" on public.profiles
  for all to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "own workspaces" on public.workspaces
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "own sheets" on public.sheets
  for all to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.workspaces w
                 where w.id = workspace_id and w.owner_id = auth.uid())
  );

create policy "own fields" on public.fields
  for all to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.sheets s
                 where s.id = sheet_id and s.owner_id = auth.uid())
  );

create policy "own records" on public.records
  for all to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.sheets s
                 where s.id = sheet_id and s.owner_id = auth.uid())
  );

-- ===========================================================================
-- Confirm it worked, rather than assuming:
--
--   select tablename, rowsecurity from pg_tables
--    where schemaname = 'public' order by tablename;
--
-- Five rows — fields, profiles, records, sheets, workspaces — every one with
-- rowsecurity = true.
-- ===========================================================================
