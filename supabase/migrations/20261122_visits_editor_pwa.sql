-- «Прогулки с Катюшей»: посещения, расширенные сведения и безопасное редактирование.
-- Миграция идемпотентна: существующие места и маршруты не удаляются и не перезаписываются.
begin;

alter table public.places add column if not exists official_name text;
alter table public.places add column if not exists original_name text;
alter table public.places add column if not exists country text;
alter table public.places add column if not exists subcategory text;
alter table public.places add column if not exists features jsonb not null default '{}'::jsonb;
alter table public.places add column if not exists additional_services jsonb not null default '[]'::jsonb;
alter table public.places add column if not exists photo_sources jsonb not null default '[]'::jsonb;
alter table public.places add column if not exists rating_source text;
alter table public.places add column if not exists price_source text;
alter table public.places add column if not exists description_source text;
alter table public.places add column if not exists verification_status text not null default 'unverified';
alter table public.places add column if not exists avg_check numeric(12,2);
alter table public.places add column if not exists updated_at timestamptz not null default now();

do $$ begin
  alter table public.places add constraint places_verification_status_chk
    check (verification_status in ('unverified','partially_verified','verified','needs_review'));
exception when duplicate_object then null; end $$;

create index if not exists places_city_category_idx on public.places(city, category);
create index if not exists places_verification_status_idx on public.places(verification_status);

alter table public.place_photos add column if not exists sort_order integer not null default 0;

-- Несколько посещений одного места одним пользователем разрешены.
create table if not exists public.place_visits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  place_id bigint not null references public.places(id) on delete cascade,
  visit_date date not null default current_date,
  impression text check (impression is null or char_length(impression) <= 5000),
  rating smallint check (rating is null or rating between 1 and 5),
  mood_tags text[] not null default '{}',
  photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists place_visits_user_place_date_idx
  on public.place_visits(user_id, place_id, visit_date desc);
alter table public.place_visits enable row level security;

drop policy if exists "visits read own" on public.place_visits;
create policy "visits read own" on public.place_visits
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "visits insert own" on public.place_visits;
create policy "visits insert own" on public.place_visits
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "visits update own" on public.place_visits;
create policy "visits update own" on public.place_visits
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "visits delete own" on public.place_visits;
create policy "visits delete own" on public.place_visits
  for delete to authenticated using (user_id = auth.uid());

-- Приватное хранилище: путь всегда начинается с UUID владельца.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('visit-photos', 'visit-photos', false, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 8388608,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "visit photos read own" on storage.objects;
create policy "visit photos read own" on storage.objects
  for select to authenticated using (
    bucket_id = 'visit-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );
drop policy if exists "visit photos upload own" on storage.objects;
create policy "visit photos upload own" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'visit-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );
drop policy if exists "visit photos update own" on storage.objects;
create policy "visit photos update own" on storage.objects
  for update to authenticated using (
    bucket_id = 'visit-photos' and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'visit-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );
drop policy if exists "visit photos delete own" on storage.objects;
create policy "visit photos delete own" on storage.objects
  for delete to authenticated using (
    bucket_id = 'visit-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Дополнительные фотографии карточек может добавлять и удалять только администратор.
drop policy if exists "place photos admin write" on public.place_photos;
create policy "place photos admin write" on public.place_photos
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Редактирование каталога доступно только пользователям из public.admin_users.
drop policy if exists "places admin write" on public.places;
create policy "places admin write" on public.places
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Автоматическая дата изменения карточки.
create or replace function public.set_place_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end $$;
drop trigger if exists places_set_updated_at on public.places;
create trigger places_set_updated_at before update on public.places
for each row execute function public.set_place_updated_at();

-- Журналирует изменения карточек, не записывая неизменившиеся поля.
create or replace function public.log_place_changes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  old_row jsonb := to_jsonb(old);
  new_row jsonb := to_jsonb(new);
  item record;
begin
  for item in select key, value from jsonb_each(new_row)
  loop
    if old_row -> item.key is distinct from item.value then
      insert into public.place_history(place_id, field, old_value, new_value, source)
      values (new.id, item.key, old_row ->> item.key, item.value #>> '{}', 'admin_ui');
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists places_audit_update on public.places;
create trigger places_audit_update after update on public.places
for each row execute function public.log_place_changes();

commit;
