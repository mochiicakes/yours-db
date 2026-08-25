-- Test-only stub. Fakes the two Supabase-provided things your schema needs,
-- so schema.sql can build on a plain Postgres. NOT for production.
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid()
);

-- A fake current-user id. Returns a fixed uuid so DEFAULT auth.uid() works.
create or replace function auth.uid() returns uuid
  language sql stable as $$ select '00000000-0000-0000-0000-000000000001'::uuid $$;

-- The 'authenticated' and 'anon' roles Supabase creates; your GRANT needs them.
do $$ begin
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon;
  end if;
end $$;