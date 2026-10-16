-- Destructive test FIXTURES only in an isolated LOCAL Supabase/test DB.
-- Run as postgres; all changes are rolled back. Never use production.
begin;
insert into auth.users (id, aud, role) values
 ('11111111-1111-4111-8111-111111111111','authenticated','authenticated'),
 ('22222222-2222-4222-8222-222222222222','authenticated','authenticated');
insert into public.home3d_allowed_users(user_id) values ('11111111-1111-4111-8111-111111111111');
insert into public.home3d_models(id,label,storage_path) values
 ('33333333-3333-4333-8333-333333333333','Fictional test','test/fictional.glb');
insert into storage.objects(bucket_id,name) values ('home-3d-private','test/fictional.glb');
-- Simulate an unsafe shared-project policy: restrictive guard must still protect us.
create policy home3d_test_broad_read on storage.objects for select to public using (true);
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ begin
 if exists(select 1 from storage.objects where bucket_id='home-3d-private') then raise exception 'anonymous storage leak'; end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
do $$ begin
 if exists(select 1 from public.home3d_allowed_users) then raise exception 'allowlist leak'; end if;
 if exists(select 1 from public.home3d_models) then raise exception 'catalog leak'; end if;
 if exists(select 1 from storage.objects where bucket_id='home-3d-private') then raise exception 'unauthorized storage leak'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
do $$ begin
 if (select count(*) from public.home3d_allowed_users) <> 1 then raise exception 'own allowlist missing'; end if;
 if (select count(*) from public.home3d_models) <> 1 then raise exception 'allowed catalog missing'; end if;
 if (select count(*) from storage.objects where bucket_id='home-3d-private') <> 1 then raise exception 'allowed model missing'; end if;
end $$;
-- Read authorization never grants browser writes, even with broad policies.
reset role;
create policy home3d_test_broad_write on storage.objects for all to authenticated using (true) with check (true);
set local role authenticated;
do $$ declare changed integer; begin
 begin
  insert into storage.objects(bucket_id,name) values ('home-3d-private','test/extra.glb');
  raise exception 'browser upload unexpectedly allowed';
 exception when insufficient_privilege then null; end;
 update storage.objects set name='test/replaced.glb' where bucket_id='home-3d-private';
 get diagnostics changed=row_count; if changed <> 0 then raise exception 'browser replacement allowed'; end if;
 delete from storage.objects where bucket_id='home-3d-private';
 get diagnostics changed=row_count; if changed <> 0 then raise exception 'browser deletion allowed'; end if;
 begin
  insert into public.home3d_allowed_users(user_id) values ('22222222-2222-4222-8222-222222222222');
  raise exception 'client self-allowlisting unexpectedly allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.home3d_allowed_users set active=false where user_id='11111111-1111-4111-8111-111111111111';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
do $$ begin
 if exists(select 1 from storage.objects where bucket_id='home-3d-private') then raise exception 'revoked user storage leak'; end if;
end $$;
reset role;
rollback;
