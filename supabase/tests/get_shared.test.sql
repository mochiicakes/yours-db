-- ===========================================================================
-- get_shared: no ids in the payload, record paging, throttled view counting.
-- ===========================================================================

begin;
create extension if not exists pgtap with schema extensions;

select plan(40);

-- ---------------------------------------------------------------------------
-- who can execute
-- Overloads are looked up in pg_proc, so a changed or added signature is still checked.
-- ---------------------------------------------------------------------------

create temp table guarded (ord int, name text, anon_ok boolean) on commit drop;
insert into guarded values
  (1, 'get_shared', true),
  (2, 'renumber_sheet', false),
  (3, 'sheet_counts', false),
  (4, 'set_title_field', false),
  (5, 'move_field', false),
  (6, 'duplicate_sheet', false),
  (7, 'bulk_set', false);

create temp view guarded_procs as
select g.ord, g.name, g.anon_ok, p.oid
  from guarded g
  left join pg_proc p on p.proname = g.name
       and p.pronamespace = 'public'::regnamespace;

select is(
  (select count(oid)::int from guarded_procs gp where gp.name = g.name),
  1, format('exactly one %s overload exists', g.name))
  from guarded g order by g.ord;

select is(
  (select bool_or(has_function_privilege('public', gp.oid, 'execute'))
     from guarded_procs gp where gp.name = g.name),
  false, format('PUBLIC cannot execute %s', g.name))
  from guarded g order by g.ord;

select is(
  (select bool_and(has_function_privilege('authenticated', gp.oid, 'execute'))
     from guarded_procs gp where gp.name = g.name),
  true, format('authenticated can execute %s', g.name))
  from guarded g order by g.ord;

select is(
  (select bool_or(has_function_privilege('anon', gp.oid, 'execute'))
     from guarded_procs gp where gp.name = g.name),
  g.anon_ok,
  format(case when g.anon_ok then 'anon can execute %s' else 'anon cannot execute %s' end, g.name))
  from guarded g order by g.ord;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000000', 'a@example.com');
insert into public.profiles (id, db_name) values
  ('a0000000-0000-0000-0000-000000000000', 'a');
insert into public.workspaces (id, owner_id, name) values
  ('a0000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-000000000000', 'A ws');
insert into public.sheets (id, owner_id, workspace_id, name, position) values
  ('a0000000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-0000000000a1', 'Big', 1000),
  ('a0000000-0000-0000-0000-0000000000a3', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-0000000000a1', 'Small', 2000);
insert into public.fields (owner_id, sheet_id, key, name, is_title) values
  ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000a2', 'name', 'Name', true),
  ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000a3', 'name', 'Name', true);

-- 1,200 rows in Big (every third one done), 3 in Small.
insert into public.records (owner_id, sheet_id, cells, done, position)
select 'a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000a2',
       jsonb_build_object('name', 'row ' || i), i % 3 = 0, i * 1000
  from generate_series(1, 1200) i;
insert into public.records (owner_id, sheet_id, cells, position)
select 'a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000a3',
       jsonb_build_object('name', 'small ' || i), i * 1000
  from generate_series(1, 3) i;

insert into public.shares (id, owner_id, token, scope, workspace_id) values
  ('a0000000-0000-0000-0000-0000000000a7', 'a0000000-0000-0000-0000-000000000000',
   'ws-token', 'workspace', 'a0000000-0000-0000-0000-0000000000a1');

set local role anon;

-- no ids -----------------------------------------------------------------------
select is(
  public.get_shared('ws-token')::text ~* '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
  false, 'the payload contains no UUIDs');
select is(
  (select array_agg(e ->> 'n' || ':' || (e ->> 'name') order by (e ->> 'n')::int)
     from jsonb_array_elements(public.get_shared('ws-token') -> 'sheets') e),
  array['0:Big', '1:Small'], 'sheets are keyed by position');

-- paging -----------------------------------------------------------------------
select is(
  (select format('%s|%s|%s', e ->> 'total', e ->> 'done', jsonb_array_length(e -> 'records'))
     from jsonb_array_elements(public.get_shared('ws-token') -> 'sheets') e
    where e ->> 'name' = 'Big'),
  '1200|400|500', 'first call: totals for the whole sheet, a 500-row first page');
select is(
  (select format('%s|%s', jsonb_array_length(e -> 'records'), e -> 'records' -> 0 ->> 'n')
     from jsonb_array_elements(public.get_shared('ws-token') -> 'sheets') e
    where e ->> 'name' = 'Small'),
  '3|0', 'a small sheet arrives whole on the first call');
select is(
  jsonb_array_length(public.get_shared('ws-token', 0, 1000, 500) -> 'sheets'),
  1, 'p_sheet returns only that sheet');
select is(
  (select format('%s|%s|%s|%s', jsonb_array_length(e -> 'records'),
                 e -> 'records' -> 0 ->> 'n', e -> 'records' -> 0 -> 'cells' ->> 'name',
                 e -> 'records' -> -1 -> 'cells' ->> 'name')
     from jsonb_array_elements(public.get_shared('ws-token', 0, 1000, 500) -> 'sheets') e),
  '200|1000|row 1001|row 1200', 'the last page holds the remaining rows, numbered in sheet order');
select is(
  (select sum(jsonb_array_length(e -> 'records'))::int
     from generate_series(0, 1199, 500) o,
          jsonb_array_elements(public.get_shared('ws-token', 0, o, 500) -> 'sheets') e),
  1200, 'walking the pages returns every row exactly once');
select is(
  (select jsonb_array_length(e -> 'records')
     from jsonb_array_elements(public.get_shared('ws-token', 0, 0, 100000) -> 'sheets') e),
  1000, 'p_limit is capped at 1000');

reset role;

-- view counting ----------------------------------------------------------------
update public.shares set view_count = 0, last_seen_at = null
 where id = 'a0000000-0000-0000-0000-0000000000a7';

set local role anon;
select count(public.get_shared('ws-token')) from generate_series(1, 100);
reset role;

select is(
  (select view_count from public.shares where id = 'a0000000-0000-0000-0000-0000000000a7'),
  1, '100 rapid calls with one token make one write');

update public.shares set view_count = 0, last_seen_at = null
 where id = 'a0000000-0000-0000-0000-0000000000a7';
set local role anon;
select public.get_shared('ws-token', 0, 500, 500);
reset role;
select is(
  (select view_count from public.shares where id = 'a0000000-0000-0000-0000-0000000000a7'),
  0, 'fetching a later page is not a view');

update public.shares set view_count = 5, last_seen_at = now() - interval '2 minutes'
 where id = 'a0000000-0000-0000-0000-0000000000a7';
set local role anon;
select public.get_shared('ws-token');
reset role;
select is(
  (select view_count from public.shares where id = 'a0000000-0000-0000-0000-0000000000a7'),
  6, 'a visit more than a minute after the last one counts');
select is(
  (select last_seen_at = now() from public.shares where id = 'a0000000-0000-0000-0000-0000000000a7'),
  true, 'and moves last_seen_at');

select * from finish();
rollback;
