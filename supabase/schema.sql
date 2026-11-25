-- AI 고속차량 점검일지: Supabase 스키마
-- Supabase 대시보드 > SQL Editor에 전체를 붙여넣고 Run 하세요.

-- 1) 사용자 프로필 (점검자 이름)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

-- 2) 점검 기록
create table if not exists public.inspections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  inspector_name text not null,
  inspected_on date not null,
  vehicle_type text not null check (vehicle_type in ('KTX-산천','KTX-청룡','SRT')),
  train_no text not null,
  inspection_type text not null check (inspection_type in ('일상점검','월상점검')),
  results jsonb not null,          -- 항목별 판정·측정값·메모·긴급도·AI판정·사진경로
  defect_count int not null default 0,
  urgent_count int not null default 0,
  ai_report text,
  created_at timestamptz default now()
);
create index if not exists inspections_created_idx on public.inspections (created_at desc);

-- 3) RLS: 로그인 사용자는 전체 조회(팀 공유), 쓰기·삭제는 본인만
alter table public.profiles enable row level security;
alter table public.inspections enable row level security;

drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select to authenticated using (true);
drop policy if exists "profiles write own" on public.profiles;
create policy "profiles write own" on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles for update to authenticated using (id = auth.uid());

drop policy if exists "insp read" on public.inspections;
create policy "insp read" on public.inspections for select to authenticated using (true);
drop policy if exists "insp insert own" on public.inspections;
create policy "insp insert own" on public.inspections for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "insp update own" on public.inspections;
create policy "insp update own" on public.inspections for update to authenticated using (user_id = auth.uid());
drop policy if exists "insp delete own" on public.inspections;
create policy "insp delete own" on public.inspections for delete to authenticated using (user_id = auth.uid());

-- 4) 사진 저장소 (비공개 버킷)
insert into storage.buckets (id, name, public)
values ('inspection-photos', 'inspection-photos', false)
on conflict (id) do nothing;

drop policy if exists "photos read" on storage.objects;
create policy "photos read" on storage.objects for select to authenticated
  using (bucket_id = 'inspection-photos');
drop policy if exists "photos insert own" on storage.objects;
create policy "photos insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'inspection-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "photos delete own" on storage.objects;
create policy "photos delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'inspection-photos' and (storage.foldername(name))[1] = auth.uid()::text);
