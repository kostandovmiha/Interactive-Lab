-- LOCAL fixtures only. All changes roll back. Never run on production.
begin;
create role home3d_test_service nologin bypassrls;
grant usage on schema storage to home3d_test_service;
grant select,insert,update,delete on storage.objects to home3d_test_service;
insert into auth.users(id,aud,role) values
 ('11111111-1111-4111-8111-111111111111','authenticated','authenticated'),
 ('22222222-2222-4222-8222-222222222222','authenticated','authenticated');
insert into public.home3d_allowed_users(user_id) values ('11111111-1111-4111-8111-111111111111');
insert into public.home3d_models(id,label,storage_path) values
 ('33333333-3333-4333-8333-333333333333','Fictional fixture','test/fictional.glb');
insert into storage.buckets(id,name,public) values ('unrelated','unrelated',false);
insert into storage.objects(bucket_id,name) values
 ('home-3d-vault','test/fictional.glb'),('home-3d-private','test/fictional.glb'),('unrelated','other.glb');
-- Restrictive guards MUST cap even a future broad ALL policy.
create policy home3d_test_broad_all on storage.objects for all to public using(true) with check(true);
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ begin
 if exists(select 1 from storage.objects where bucket_id in ('home-3d-vault','home-3d-private')) then raise exception 'anonymous direct download leak'; end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
do $$ begin
 if exists(select 1 from storage.objects where bucket_id in ('home-3d-vault','home-3d-private')) then raise exception 'denied direct download leak'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
do $$ declare bucket text; changed integer; begin
 if not public.home3d_is_allowed() then raise exception 'authorized fixture not established'; end if;
 if (select count(*) from public.home3d_models) <> 1 then raise exception 'authorized catalog unavailable to gateway'; end if;
 if exists(select 1 from storage.objects where bucket_id in ('home-3d-vault','home-3d-private')) then raise exception 'allowed user must NOT download or mint signed URLs directly'; end if;
 if (select count(*) from storage.objects where bucket_id='unrelated') <> 1 then raise exception 'unrelated bucket unexpectedly restricted'; end if;
 foreach bucket in array array['home-3d-vault','home-3d-private'] loop
  begin
   insert into storage.objects(bucket_id,name) values(bucket,'test/browser.glb');
   raise exception 'browser upload allowed';
  exception when insufficient_privilege then null; end;
  update storage.objects set name='test/replaced.glb' where bucket_id=bucket;
  get diagnostics changed=row_count; if changed <> 0 then raise exception 'browser update allowed'; end if;
  delete from storage.objects where bucket_id=bucket;
  get diagnostics changed=row_count; if changed <> 0 then raise exception 'browser deletion allowed'; end if;
 end loop;
end $$;
reset role;
set local role home3d_test_service;
do $$ begin
 if (select count(*) from storage.objects where bucket_id='home-3d-vault') <> 1 then raise exception 'server-only vault read unavailable'; end if;
end $$;
reset role;
rollback;
