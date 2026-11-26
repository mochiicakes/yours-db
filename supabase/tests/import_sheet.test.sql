-- ===========================================================================
-- import_sheet, import_rows
-- Rows land in order across batches; a bad cell rolls back only its own call;
-- other people's workspaces and sheets are refused; batches are capped.
-- ===========================================================================

begin;
create extension if not exists pgtap with schema extensions;

select plan(18);

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000000', 'a@example.com'),
  ('b0000000-0000-0000-0000-000000000000', 'b@example.com');

insert into public.workspaces (id, owner_id, name) values
  ('a0000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-000000000000', 'A ws'),
  ('b0000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-000000000000', 'B ws');

insert into public.sheets (id, owner_id, workspace_id, name, position) values
  ('a0000000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-0000000000a1', 'Existing', 1000),
  ('b0000000-0000-0000-0000-0000000000b2', 'b0000000-0000-0000-0000-000000000000',
   'b0000000-0000-0000-0000-0000000000b1', 'B sheet', 1000);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-000000000000", "role": "authenticated"}', true);

-- import_sheet: the first batch ------------------------------------------------
create temp table imp as
select public.import_sheet(
  'a0000000-0000-0000-0000-0000000000a1',
  '  Sales  ',
  '[{"key": "name",   "name": "Name",   "type": "text",   "options": [], "is_title": true},
    {"key": "qty",    "name": "Qty",    "type": "number"},
    {"key": "status", "name": "Status", "type": "select", "options": ["Open", "Done"]}]',
  '[{"name": "one", "qty": 1, "status": "Open"}, {"name": "two"}]'
) as j;

create temp view new_sheet as
select (j -> 'sheet' ->> 'id')::uuid as id from imp;

select is(
  (select j -> 'sheet' ->> 'name' from imp), 'Sales',
  'import_sheet returns the new sheet, with its name trimmed');
select is(
  (select position from public.sheets where id = (select id from new_sheet)), 1100::float8,
  'and puts it after the last sheet in the workspace');
select is(
  (select array_agg(key order by position) from public.fields
    where sheet_id = (select id from new_sheet)),
  array['name', 'qty', 'status'],
  'columns are created in the order sent');
select is(
  (select jsonb_agg(f ->> 'key') from imp, jsonb_array_elements(j -> 'fields') f),
  '["name", "qty", "status"]'::jsonb,
  'and returned in that order');
select is(
  (select options from public.fields
    where sheet_id = (select id from new_sheet) and key = 'status'),
  array['Open', 'Done'],
  'choice options are stored');
select is(
  (select array_agg(key) from public.fields
    where sheet_id = (select id from new_sheet) and is_title),
  array['name'],
  'only the column marked as title is the title');

-- import_rows: later batches ---------------------------------------------------
select is(
  public.import_rows((select id from new_sheet), '[{"name": "three"}, {"name": "four"}]', 2),
  2, 'import_rows returns how many rows it added');
select is(
  (select array_agg(cells ->> 'name' order by position) from public.records
    where sheet_id = (select id from new_sheet)),
  array['one', 'two', 'three', 'four'],
  'rows from every batch are in file order');
select is(
  (select array_agg(position order by position) from public.records
    where sheet_id = (select id from new_sheet)),
  array[1000, 2000, 3000, 4000]::float8[],
  'and evenly spaced');

-- a bad cell rolls back only its own call ----------------------------------------
select throws_ok(
  $$ select public.import_rows((select id from new_sheet),
       '[{"name": "five"}, {"qty": "lots"}]', 4) $$,
  'P0001', null,
  'import_rows fails when one row has a bad cell');
select is(
  (select count(*)::int from public.records where sheet_id = (select id from new_sheet)),
  4, 'and adds none of that batch, keeping the earlier batches');

select throws_ok(
  $$ select public.import_sheet('a0000000-0000-0000-0000-0000000000a1', 'Broken',
       '[{"key": "qty", "name": "Qty", "type": "number"}]', '[{"qty": "lots"}]') $$,
  'P0001', null,
  'import_sheet fails when a first-batch row has a bad cell');
select is(
  (select count(*)::int from public.sheets
    where workspace_id = 'a0000000-0000-0000-0000-0000000000a1'),
  2, 'and leaves no half-made sheet behind');

-- other people's data ----------------------------------------------------------
select throws_ok(
  $$ select public.import_sheet('b0000000-0000-0000-0000-0000000000b1', 'Mine now',
       '[{"key": "name", "name": "Name", "type": "text"}]', '[]') $$,
  'P0001', 'That workspace no longer exists. Reload the page.',
  'import_sheet refuses a workspace you do not own');
select throws_ok(
  $$ select public.import_rows('b0000000-0000-0000-0000-0000000000b2', '[{}]', 0) $$,
  'P0001', 'That sheet no longer exists. Reload the page.',
  'import_rows refuses a sheet you do not own');

-- caps and bad input -----------------------------------------------------------
select throws_ok(
  $$ select public.import_sheet('a0000000-0000-0000-0000-0000000000a1', 'Big',
       '[{"key": "name", "name": "Name", "type": "text"}]',
       (select jsonb_agg('{}'::jsonb) from generate_series(1, 1001))) $$,
  'P0001', 'Send at most 1,000 rows at a time.',
  'import_sheet caps a batch at 1,000 rows');
select throws_ok(
  $$ select public.import_rows((select id from new_sheet),
       (select jsonb_agg('{}'::jsonb) from generate_series(1, 1001)), 4) $$,
  'P0001', 'Send at most 1,000 rows at a time.',
  'import_rows caps a batch at 1,000 rows');
select throws_ok(
  $$ select public.import_sheet('a0000000-0000-0000-0000-0000000000a1', '   ',
       '[{"key": "name", "name": "Name", "type": "text"}]', '[]') $$,
  'P0001', 'Give the sheet a name.',
  'import_sheet needs a name');

select * from finish();
rollback;
