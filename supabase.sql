-- Chạy 1 lần trong Supabase > SQL Editor
create table if not exists public.mygia (
  coll text not null,            -- projects | listings | pins | demands
  id   text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (coll, id)
);
alter table public.mygia enable row level security;
create policy "read all"    on public.mygia for select using (true);
create policy "write auth"  on public.mygia for insert to authenticated with check (true);
create policy "update auth" on public.mygia for update to authenticated using (true) with check (true);
create policy "delete auth" on public.mygia for delete to authenticated using (true);
alter publication supabase_realtime add table public.mygia;

-- Kho ảnh sơ đồ (khi thêm dự án mới từ app)
insert into storage.buckets (id, name, public) values ('plans','plans',true) on conflict do nothing;
create policy "plans read"   on storage.objects for select using (bucket_id = 'plans');
create policy "plans upload" on storage.objects for insert to authenticated with check (bucket_id = 'plans');
