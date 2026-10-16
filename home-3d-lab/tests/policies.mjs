import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const tools = process.env.HOME3D_TEST_TOOLS || '/tmp/home3d-tools';
const { PGlite } = await import(pathToFileURL(`${tools}/node_modules/@electric-sql/pglite/dist/index.js`));
const db = new PGlite();
// Supabase-compatible minimal role/schema fixtures. Real PostgreSQL RLS engine;
// does NOT emulate the HTTP Storage service or live Google authentication.
const bootstrap = `
create role anon nologin; create role authenticated nologin;
create schema auth; create schema storage;
create table auth.users(id uuid primary key, aud text, role text);
create function auth.uid() returns uuid language sql stable as $$
 select (nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'sub')::uuid;
$$;
create function auth.role() returns text language sql stable as $$
 select nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'role';
$$;
create table storage.buckets(id text primary key, name text, public boolean,
 file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(id uuid default gen_random_uuid() primary key,
 bucket_id text references storage.buckets(id), name text);
alter table storage.objects enable row level security;
grant usage on schema public,auth,storage to anon,authenticated;
grant select,insert,update,delete on storage.objects to anon,authenticated;
`;
const migration = await readFile(new URL('../../supabase/migrations/202610120001_home3d_private.sql', import.meta.url), 'utf8');
assert.doesNotMatch(migration, /alter\s+table\s+storage\./i, 'Migration must not ALTER a Supabase-owned Storage table');
// Supabase pre-enables Storage RLS. Reject missing protection atomically instead
// of attempting DDL that Dashboard roles are not permitted to perform.
const unprotected = new PGlite();
await unprotected.exec(bootstrap);
await unprotected.exec('alter table storage.objects disable row level security');
await assert.rejects(unprotected.exec(migration), /Storage RLS must already be enabled/);
await unprotected.exec('rollback');
const state = await unprotected.query("select to_regclass('public.home3d_models') as models, (select count(*) from storage.buckets) as buckets");
assert.equal(state.rows[0].models, null);
assert.equal(Number(state.rows[0].buckets), 0);
await unprotected.close();
console.log('PASS: missing managed Storage RLS fails closed without partial app setup or managed-table ALTER.');
await db.exec(bootstrap);
await db.exec(migration);
await db.exec(await readFile(new URL('./rls.sql', import.meta.url), 'utf8'));
const policies = await db.query("select count(*)::int as count from pg_policies where policyname like 'home3d_%'");
if (policies.rows[0].count !== 7) throw new Error('Unexpected policy count');
console.log('PASS: PostgreSQL migration + anonymous/denied/allowed/revoked RLS cases, broad-policy guard, browser write/self-allowlisting denial.');
await db.close();
