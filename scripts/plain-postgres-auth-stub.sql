-- Test-only stub for running the migrations on a plain Postgres (no Docker, no
-- Supabase). Fakes the parts of Supabase the schema relies on: auth.users, an
-- auth.uid() that reads the JWT subject the way Supabase does, and the
-- authenticated / anon roles. NOT for production.
--
--   psql -d <db> -f scripts/plain-postgres-auth-stub.sql \
--               -f supabase/migrations/<each migration, in order>.sql
--
-- Switch users the way PostgREST does:
--   set role authenticated;
--   set request.jwt.claims = '{"sub": "<uuid>"}';
create schema if not exists auth;

create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text
);

create or replace function auth.uid() returns uuid
  language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

-- Roles are cluster-wide, so only create them if they are missing.
do $$ begin
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon;
  end if;
end $$;

grant usage on schema public, auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
-- Supabase grants table access to the API roles by default; RLS then decides.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated, anon;
