-- Apply AFTER 202610120001_home3d_private.sql. No private bytes move via SQL.
-- Original per-user CDN cached GETs survived allowlist revocation in live tests.
-- All new assets belong in a NEW vault whose browser principals never read.
begin;
do $home3d_storage_rls$
begin
  if not exists (
    select 1 from pg_catalog.pg_class
    where oid = pg_catalog.to_regclass('storage.objects') and relrowsecurity
  ) then
    raise exception 'Supabase Storage RLS must already be enabled on storage.objects.';
  end if;
end;
$home3d_storage_rls$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('home-3d-vault', 'home-3d-vault', false, 104857600,
  array['model/gltf-binary', 'application/octet-stream'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
update storage.buckets set public = false where id = 'home-3d-private';

-- New restrictive guards cap every permissive shared-project policy, including
-- the original download policy, for BOTH the retired bucket and the new vault.
-- service_role bypasses RLS and exists only in trusted server/Dashboard tools.
create policy home3d_vault_read_guard on storage.objects as restrictive
  for select to public using (bucket_id not in ('home-3d-private', 'home-3d-vault'));
create policy home3d_vault_insert_guard on storage.objects as restrictive
  for insert to public with check (bucket_id not in ('home-3d-private', 'home-3d-vault'));
create policy home3d_vault_update_guard on storage.objects as restrictive
  for update to public using (bucket_id not in ('home-3d-private', 'home-3d-vault'))
  with check (bucket_id not in ('home-3d-private', 'home-3d-vault'));
create policy home3d_vault_delete_guard on storage.objects as restrictive
  for delete to public using (bucket_id not in ('home-3d-private', 'home-3d-vault'));
commit;
