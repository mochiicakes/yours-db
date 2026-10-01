-- ===========================================================================
-- Row Level Security, get_shared and validate_cells.
--
-- Run with `npx supabase test db`. Everything happens inside one transaction
-- that is rolled back, so the database is left as it was.
--
-- Two users, A and B, each own a full tree: workspace -> sheets -> fields ->
-- records -> shares. The tests act as A (and as anon) and prove that nothing
-- of B's can be read, changed, deleted or built upon.
-- ===========================================================================

begin;
create extension if not exists pgtap with schema extensions;

select plan(42);

-- ---------------------------------------------------------------------------
-- fixtures, inserted as postgres (bypasses RLS)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000000', 'a@example.com'),
  ('b0000000-0000-0000-0000-000000000000', 'b@example.com');

insert into public.profiles (id, db_name) values
  ('a0000000-0000-0000-0000-000000000000', 'a'),
  ('b0000000-0000-0000-0000-000000000000', 'b');

insert into public.workspaces (id, owner_id, name) values
  ('a0000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-000000000000', 'A ws'),
  ('b0000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-000000000000', 'B ws');

insert into public.sheets (id, owner_id, workspace_id, name, position) values
  ('a0000000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-0000000000a1', 'A sheet 1', 1000),
  ('a0000000-0000-0000-0000-0000000000a3', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-0000000000a1', 'A sheet 2', 2000),
  ('b0000000-0000-0000-0000-0000000000b2', 'b0000000-0000-0000-0000-000000000000',
   'b0000000-0000-0000-0000-0000000000b1', 'B sheet', 1000);

insert into public.fields (id, owner_id, sheet_id, key, name, type, required, is_title) values
  ('a0000000-0000-0000-0000-0000000000a4', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-0000000000a2', 'title', 'Title', 'text', true, true),
  ('a0000000-0000-0000-0000-0000000000a5', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-0000000000a2', 'count', 'Count', 'number', false, false),
  ('b0000000-0000-0000-0000-0000000000b4', 'b0000000-0000-0000-0000-000000000000',
   'b0000000-0000-0000-0000-0000000000b2', 'title', 'Title', 'text', true, true);

insert into public.records (id, owner_id, sheet_id, cells) values
  ('a0000000-0000-0000-0000-0000000000a6', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-0000000000a2', '{"title": "a row"}'),
  ('b0000000-0000-0000-0000-0000000000b6', 'b0000000-0000-0000-0000-000000000000',
   'b0000000-0000-0000-0000-0000000000b2', '{"title": "b row"}');

insert into public.shares (id, owner_id, token, scope, sheet_id, workspace_id, revoked, expires_at) values
  ('a0000000-0000-0000-0000-0000000000a7', 'a0000000-0000-0000-0000-000000000000',
   'a-sheet-token', 'sheet', 'a0000000-0000-0000-0000-0000000000a2', null, false, null),
  ('a0000000-0000-0000-0000-0000000000a8', 'a0000000-0000-0000-0000-000000000000',
   'a-workspace-token', 'workspace', null, 'a0000000-0000-0000-0000-0000000000a1', false, null),
  ('a0000000-0000-0000-0000-0000000000a9', 'a0000000-0000-0000-0000-000000000000',
   'a-revoked-token', 'sheet', 'a0000000-0000-0000-0000-0000000000a2', null, true, null),
  ('a0000000-0000-0000-0000-0000000000aa', 'a0000000-0000-0000-0000-000000000000',
   'a-expired-token', 'sheet', 'a0000000-0000-0000-0000-0000000000a2', null, false,
   now() - interval '1 day'),
  ('b0000000-0000-0000-0000-0000000000b7', 'b0000000-0000-0000-0000-000000000000',
   'b-sheet-token', 'sheet', 'b0000000-0000-0000-0000-0000000000b2', null, false, null);

-- ---------------------------------------------------------------------------
-- act as A
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-000000000000", "role": "authenticated"}', true);

-- Control: A sees their own rows, so the zeros below mean something.
select is((select count(*)::int from public.workspaces), 1, 'A sees exactly their own workspace');

-- select ------------------------------------------------------------------
select is_empty($$ select id from public.profiles   where id       = 'b0000000-0000-0000-0000-000000000000' $$, 'A cannot select B''s profile');
select is_empty($$ select id from public.workspaces where owner_id = 'b0000000-0000-0000-0000-000000000000' $$, 'A cannot select B''s workspaces');
select is_empty($$ select id from public.sheets     where owner_id = 'b0000000-0000-0000-0000-000000000000' $$, 'A cannot select B''s sheets');
select is_empty($$ select id from public.fields     where owner_id = 'b0000000-0000-0000-0000-000000000000' $$, 'A cannot select B''s fields');
select is_empty($$ select id from public.records    where owner_id = 'b0000000-0000-0000-0000-000000000000' $$, 'A cannot select B''s records');
select is_empty($$ select id from public.shares     where owner_id = 'b0000000-0000-0000-0000-000000000000' $$, 'A cannot select B''s shares');

-- update ------------------------------------------------------------------
select is_empty($$ update public.profiles   set db_name = 'x'           where id = 'b0000000-0000-0000-0000-000000000000' returning id $$, 'A cannot update B''s profile');
select is_empty($$ update public.workspaces set name = 'x'              where id = 'b0000000-0000-0000-0000-0000000000b1' returning id $$, 'A cannot update B''s workspace');
select is_empty($$ update public.sheets     set name = 'x'              where id = 'b0000000-0000-0000-0000-0000000000b2' returning id $$, 'A cannot update B''s sheet');
select is_empty($$ update public.fields     set name = 'x'              where id = 'b0000000-0000-0000-0000-0000000000b4' returning id $$, 'A cannot update B''s field');
select is_empty($$ update public.records    set done = true             where id = 'b0000000-0000-0000-0000-0000000000b6' returning id $$, 'A cannot update B''s record');
select is_empty($$ update public.shares     set revoked = true          where id = 'b0000000-0000-0000-0000-0000000000b7' returning id $$, 'A cannot update B''s share');

-- delete ------------------------------------------------------------------
select is_empty($$ delete from public.shares     where id = 'b0000000-0000-0000-0000-0000000000b7' returning id $$, 'A cannot delete B''s share');
select is_empty($$ delete from public.records    where id = 'b0000000-0000-0000-0000-0000000000b6' returning id $$, 'A cannot delete B''s record');
select is_empty($$ delete from public.fields     where id = 'b0000000-0000-0000-0000-0000000000b4' returning id $$, 'A cannot delete B''s field');
select is_empty($$ delete from public.sheets     where id = 'b0000000-0000-0000-0000-0000000000b2' returning id $$, 'A cannot delete B''s sheet');
select is_empty($$ delete from public.workspaces where id = 'b0000000-0000-0000-0000-0000000000b1' returning id $$, 'A cannot delete B''s workspace');
select is_empty($$ delete from public.profiles   where id = 'b0000000-0000-0000-0000-000000000000' returning id $$, 'A cannot delete B''s profile');

-- attaching a child to B's parent ------------------------------------------
select throws_ok(
  $$ insert into public.sheets (workspace_id, name)
     values ('b0000000-0000-0000-0000-0000000000b1', 'squatter') $$,
  '42501', null, 'A cannot create a sheet in B''s workspace');
select throws_ok(
  $$ insert into public.fields (sheet_id, key, name)
     values ('b0000000-0000-0000-0000-0000000000b2', 'squat', 'Squat') $$,
  '42501', null, 'A cannot add a field to B''s sheet');
select throws_ok(
  $$ insert into public.records (sheet_id, cells)
     values ('b0000000-0000-0000-0000-0000000000b2', '{}') $$,
  '42501', null, 'A cannot add a record to B''s sheet');
select throws_ok(
  $$ insert into public.shares (token, scope, sheet_id)
     values ('steal-b-sheet', 'sheet', 'b0000000-0000-0000-0000-0000000000b2') $$,
  '42501', null, 'A cannot share B''s sheet');
select throws_ok(
  $$ insert into public.shares (token, scope, workspace_id)
     values ('steal-b-workspace', 'workspace', 'b0000000-0000-0000-0000-0000000000b1') $$,
  '42501', null, 'A cannot share B''s workspace');

-- someone else's owner_id ------------------------------------------------------
select throws_ok(
  $$ insert into public.workspaces (owner_id, name)
     values ('b0000000-0000-0000-0000-000000000000', 'forged') $$,
  '42501', null, 'A cannot insert a workspace with B''s owner_id');
select throws_ok(
  $$ insert into public.records (owner_id, sheet_id, cells)
     values ('b0000000-0000-0000-0000-000000000000',
             'a0000000-0000-0000-0000-0000000000a2', '{"title": "forged"}') $$,
  '42501', null, 'A cannot insert a record with B''s owner_id, even on A''s own sheet');

-- validate_cells -------------------------------------------------------------
select throws_ok(
  $$ insert into public.records (sheet_id, cells)
     values ('a0000000-0000-0000-0000-0000000000a2', '{"title": "x", "count": "seven"}') $$,
  'P0001', 'Count must be a number.', 'validate_cells rejects a wrong type');
select throws_ok(
  $$ insert into public.records (sheet_id, cells)
     values ('a0000000-0000-0000-0000-0000000000a2', '{"title": "x", "nope": 1}') $$,
  'P0001', 'This sheet has no column called "nope".', 'validate_cells rejects an unknown column');
select throws_ok(
  $$ insert into public.records (sheet_id, cells)
     values ('a0000000-0000-0000-0000-0000000000a2', '{"count": 1}') $$,
  'P0001', 'Title is required.', 'validate_cells rejects a missing required value');

reset role;

-- ---------------------------------------------------------------------------
-- act as anon
-- ---------------------------------------------------------------------------

set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);

select is((select count(*)::int from public.profiles),   0, 'anon selects 0 profiles');
select is((select count(*)::int from public.workspaces), 0, 'anon selects 0 workspaces');
select is((select count(*)::int from public.sheets),     0, 'anon selects 0 sheets');
select is((select count(*)::int from public.fields),     0, 'anon selects 0 fields');
select is((select count(*)::int from public.records),    0, 'anon selects 0 records');
select is((select count(*)::int from public.shares),     0, 'anon selects 0 shares');

select is(public.get_shared('a-revoked-token'), null, 'get_shared returns null for a revoked token');
select is(public.get_shared('a-expired-token'), null, 'get_shared returns null for an expired token');

select is(
  (select array_agg(e ->> 'name' order by e ->> 'name')
     from jsonb_array_elements(public.get_shared('a-sheet-token') -> 'sheets') e),
  array['A sheet 1'],
  'a sheet token returns only its own sheet');
select is(
  (select array_agg(e ->> 'name' order by e ->> 'name')
     from jsonb_array_elements(public.get_shared('a-workspace-token') -> 'sheets') e),
  array['A sheet 1', 'A sheet 2'],
  'a workspace token returns only that workspace''s sheets');
select is(
  (select array_agg(r -> 'cells' ->> 'title')
     from jsonb_array_elements(public.get_shared('a-sheet-token') -> 'sheets') e,
          jsonb_array_elements(e -> 'records') r),
  array['a row'],
  'a sheet token returns only its own records');

reset role;

-- ---------------------------------------------------------------------------
-- back as postgres: nothing of B's changed
-- ---------------------------------------------------------------------------

select is(
  (select format('%s|%s|%s|%s|%s|%s',
     (select db_name from public.profiles   where id = 'b0000000-0000-0000-0000-000000000000'),
     (select name    from public.workspaces where id = 'b0000000-0000-0000-0000-0000000000b1'),
     (select name    from public.sheets     where id = 'b0000000-0000-0000-0000-0000000000b2'),
     (select name    from public.fields     where id = 'b0000000-0000-0000-0000-0000000000b4'),
     (select done    from public.records    where id = 'b0000000-0000-0000-0000-0000000000b6'),
     (select revoked from public.shares     where id = 'b0000000-0000-0000-0000-0000000000b7'))),
  'b|B ws|B sheet|Title|f|f',
  'every one of B''s rows is unchanged');
select is(
  (select count(*)::int from public.shares where token like 'steal-%'),
  0,
  'no share pointing at B''s data was created');

select * from finish();
rollback;
