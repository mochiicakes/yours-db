-- ===========================================================================
-- sheet_counts: per-sheet totals for the caller's own rows only.
-- ===========================================================================

begin;
create extension if not exists pgtap with schema extensions;

select plan(4);

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000000', 'a@example.com'),
  ('b0000000-0000-0000-0000-000000000000', 'b@example.com');
insert into public.workspaces (id, owner_id, name) values
  ('a0000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-000000000000', 'A ws'),
  ('b0000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-000000000000', 'B ws');
insert into public.sheets (id, owner_id, workspace_id, name) values
  ('a0000000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-0000000000a1', 'Big'),
  ('a0000000-0000-0000-0000-0000000000a3', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-0000000000a1', 'Empty'),
  ('b0000000-0000-0000-0000-0000000000b2', 'b0000000-0000-0000-0000-000000000000',
   'b0000000-0000-0000-0000-0000000000b1', 'B sheet');

-- 2,500 rows, every fifth one done; plus a few of B's.
insert into public.records (owner_id, sheet_id, done, position)
select 'a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000a2',
       i % 5 = 0, i * 1000
  from generate_series(1, 2500) i;
insert into public.records (owner_id, sheet_id, position)
select 'b0000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-0000000000b2', i
  from generate_series(1, 7) i;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-000000000000", "role": "authenticated"}', true);

select is(
  (select format('%s|%s', total, done) from public.sheet_counts()
    where sheet_id = 'a0000000-0000-0000-0000-0000000000a2'),
  '2500|500', 'counts every row of a 2,500-row sheet, and the done ones');
select is(
  (select count(*)::int from public.sheet_counts()), 1,
  'a sheet with no rows has no entry (the app reads that as 0)');
select is_empty(
  $$ select 1 from public.sheet_counts() where sheet_id = 'b0000000-0000-0000-0000-0000000000b2' $$,
  'another user''s sheets are not counted');

reset role;
set local role anon;
select throws_ok($$ select * from public.sheet_counts() $$, '42501', null, 'anon cannot call sheet_counts');
reset role;

select * from finish();
rollback;
