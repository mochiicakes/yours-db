-- ===========================================================================
-- set_title_field, move_field, duplicate_sheet, bulk_set
-- The key test: bulk_set with a value one row rejects changes no rows.
-- ===========================================================================

begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000000', 'a@example.com'),
  ('b0000000-0000-0000-0000-000000000000', 'b@example.com');

insert into public.workspaces (id, owner_id, name) values
  ('a0000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-000000000000', 'A ws'),
  ('b0000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-000000000000', 'B ws');

-- Two sheets whose tag column allows different choices.
insert into public.sheets (id, owner_id, workspace_id, name, position) values
  ('a0000000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-0000000000a1', 'Sheet X', 1000),
  ('a0000000-0000-0000-0000-0000000000a3', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-0000000000a1', 'Sheet Y', 2000),
  ('b0000000-0000-0000-0000-0000000000b2', 'b0000000-0000-0000-0000-000000000000',
   'b0000000-0000-0000-0000-0000000000b1', 'B sheet', 1000);

insert into public.fields (id, owner_id, sheet_id, key, name, type, options, is_title, position) values
  ('a0000000-0000-0000-0000-0000000000f1', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-0000000000a2', 'name', 'Name', 'text', '{}', true, 1000),
  ('a0000000-0000-0000-0000-0000000000f2', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-0000000000a2', 'tag', 'Tag', 'select', '{x,z}', false, 2000),
  ('a0000000-0000-0000-0000-0000000000f3', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-0000000000a2', 'note', 'Note', 'text', '{}', false, 3000),
  ('a0000000-0000-0000-0000-0000000000f4', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-0000000000a3', 'tag', 'Tag', 'select', '{y,z}', false, 1000),
  ('b0000000-0000-0000-0000-0000000000f5', 'b0000000-0000-0000-0000-000000000000',
   'b0000000-0000-0000-0000-0000000000b2', 'tag', 'Tag', 'select', '{x}', false, 1000);

insert into public.records (id, owner_id, sheet_id, cells, position) values
  ('a0000000-0000-0000-0000-0000000000c1', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-0000000000a2', '{"name": "one", "tag": "z"}', 1000),
  ('a0000000-0000-0000-0000-0000000000c2', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-0000000000a2', '{"name": "two", "tag": "z"}', 2000),
  ('a0000000-0000-0000-0000-0000000000c3', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-0000000000a3', '{"tag": "z"}', 1000),
  ('b0000000-0000-0000-0000-0000000000c4', 'b0000000-0000-0000-0000-000000000000',
   'b0000000-0000-0000-0000-0000000000b2', '{"tag": "x"}', 1000);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-000000000000", "role": "authenticated"}', true);

-- bulk_set ---------------------------------------------------------------------
select throws_ok(
  $$ select * from public.bulk_set(
       array['a0000000-0000-0000-0000-0000000000c1', 'a0000000-0000-0000-0000-0000000000c2',
             'a0000000-0000-0000-0000-0000000000c3']::uuid[],
       'tag', '"x"') $$,
  'P0001', 'Tag must be one of: y, z.',
  'bulk_set fails when one row rejects the value');
select is(
  (select array_agg(cells ->> 'tag' order by position, id) from public.records),
  array['z', 'z', 'z'],
  'and no row changed, including the two where the value was valid');

select is(
  (select count(*)::int from public.bulk_set(
     array['a0000000-0000-0000-0000-0000000000c1', 'a0000000-0000-0000-0000-0000000000c2']::uuid[],
     'tag', '"x"')),
  2, 'bulk_set returns every row it updated');
select is(
  (select array_agg(cells ->> 'tag' order by position) from public.records
    where sheet_id = 'a0000000-0000-0000-0000-0000000000a2'),
  array['x', 'x'], 'bulk_set wrote the value to each row');

select is(
  (select bool_and(not (cells ? 'tag')) from public.bulk_set(
     array['a0000000-0000-0000-0000-0000000000c1']::uuid[], 'tag', null)),
  true, 'bulk_set with null clears the column');

select is_empty(
  $$ select id from public.bulk_set(array['b0000000-0000-0000-0000-0000000000c4']::uuid[], 'tag', '"x"') $$,
  'bulk_set cannot touch another user''s rows');

-- set_title_field ----------------------------------------------------------------
select lives_ok(
  $$ select public.set_title_field('a0000000-0000-0000-0000-0000000000a2',
                                   'a0000000-0000-0000-0000-0000000000f3') $$,
  'set_title_field runs');
select is(
  (select array_agg(key) from public.fields
    where sheet_id = 'a0000000-0000-0000-0000-0000000000a2' and is_title),
  array['note'], 'exactly one title column, the new one');
select throws_ok(
  $$ select public.set_title_field('a0000000-0000-0000-0000-0000000000a2',
                                   'a0000000-0000-0000-0000-0000000000f4') $$,
  'P0001', 'That column no longer exists. Reload the sheet.',
  'set_title_field refuses a column from another sheet');
select is(
  (select key from public.fields
    where sheet_id = 'a0000000-0000-0000-0000-0000000000a2' and is_title),
  'note', 'and the failed call left the title where it was');

-- move_field ---------------------------------------------------------------------
select is(
  (select count(*)::int from public.move_field('a0000000-0000-0000-0000-0000000000f3', 1500)),
  3, 'move_field returns every column of the sheet');
select is(
  (select array_agg(key || '@' || position::int order by position) from public.fields
    where sheet_id = 'a0000000-0000-0000-0000-0000000000a2'),
  array['name@1000', 'note@2000', 'tag@3000'],
  'move_field put the column in its new place and respaced the sheet');

-- duplicate_sheet ----------------------------------------------------------------
-- Capture ids first: a volatile call inside WHERE would run once per row.
select set_config('test.with_rows',
  public.duplicate_sheet('a0000000-0000-0000-0000-0000000000a2', true)::text, true);
select set_config('test.without_rows',
  public.duplicate_sheet('a0000000-0000-0000-0000-0000000000a2', false)::text, true);

select is(
  (select format('%s|%s|%s|%s', s.name, s.owner_id,
     (select count(*) from public.fields f where f.sheet_id = s.id),
     (select count(*) from public.records r where r.sheet_id = s.id))
     from public.sheets s
    where s.id = current_setting('test.with_rows')::uuid),
  'Sheet X copy|a0000000-0000-0000-0000-000000000000|3|2',
  'duplicate_sheet with rows copies the columns and rows, owned by the caller');
select is(
  (select (select count(*)::int from public.records r where r.sheet_id = s.id)
     from public.sheets s
    where s.id = current_setting('test.without_rows')::uuid),
  0, 'duplicate_sheet without rows copies no rows');
select throws_ok(
  $$ select public.duplicate_sheet('b0000000-0000-0000-0000-0000000000b2', true) $$,
  'P0001', 'That sheet no longer exists. Reload the page.',
  'duplicate_sheet cannot copy another user''s sheet');

reset role;

set local role anon;
select throws_ok(
  $$ select * from public.bulk_set(array[]::uuid[], 'tag', '"x"') $$,
  '42501', null, 'anon cannot run bulk_set');

reset role;

select * from finish();
rollback;
