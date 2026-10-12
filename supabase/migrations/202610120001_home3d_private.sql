-- Run using the Supabase SQL editor / migration owner, never from the browser.
-- UUIDs and model metadata are administered by the project owner only.
begin;
create table public.home3d_allowed_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.home3d_models (
  id uuid primary key default gen_random_uuid(),
  label text not null check (length(label) between 1 and 120),
  storage_path text not null unique check (
    storage_path ~* '\.glb$' and storage_path !~ '(^/|//|(^|/)\.\.?(/|$)|[\\?#])'
  ),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.home3d_allowed_users enable row level security;
alter table public.home3d_models enable row level security;
revoke all on public.home3d_allowed_users, public.home3d_models from anon, authenticated;
grant select on public.home3d_allowed_users, public.home3d_models to authenticated;

create function public.home3d_is_allowed() returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.role()) = 'authenticated' and exists (
    select 1 from public.home3d_allowed_users a
    where a.user_id = (select auth.uid()) and a.active
  );
$$;
create function public.home3d_can_read_object(object_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.home3d_is_allowed() and exists (
    select 1 from public.home3d_models m
    where m.storage_path = object_name and m.enabled
  );
$$;
revoke all on function public.home3d_is_allowed(), public.home3d_can_read_object(text) from public, anon;
grant execute on function public.home3d_is_allowed(), public.home3d_can_read_object(text) to anon, authenticated;

create policy home3d_read_own_allowlist on public.home3d_allowed_users
  for select to authenticated using (user_id = (select auth.uid()) and active);
create policy home3d_read_model_catalog on public.home3d_models
  for select to authenticated using (enabled and (select public.home3d_is_allowed()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('home-3d-private', 'home-3d-private', false, 104857600,
  array['model/gltf-binary', 'application/octet-stream'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table storage.objects enable row level security;

-- This permissive policy supplies SELECT only, after server-side UUID checks.
create policy home3d_download_allowed on storage.objects
  for select to authenticated using (
    bucket_id = 'home-3d-private' and public.home3d_can_read_object(name)
  );

-- Restrictive guard caps OTHER permissive policies in a shared Supabase project.
-- Helper functions may be evaluated by the planner; anon may execute them,
-- but home3d_is_allowed explicitly requires authenticated role and a valid UUID.
create policy home3d_download_guard on storage.objects as restrictive
  for select to public using (
    case when bucket_id <> 'home-3d-private' then true
      when (select auth.role()) = 'authenticated' then public.home3d_can_read_object(name)
      else false end
  );
-- Browser roles cannot upload/replace/delete private house assets even if another
-- application's permissive policy happens to allow broad writes.
create policy home3d_insert_guard on storage.objects as restrictive
  for insert to public with check (bucket_id <> 'home-3d-private');
create policy home3d_update_guard on storage.objects as restrictive
  for update to public using (bucket_id <> 'home-3d-private')
  with check (bucket_id <> 'home-3d-private');
create policy home3d_delete_guard on storage.objects as restrictive
  for delete to public using (bucket_id <> 'home-3d-private');
commit;
