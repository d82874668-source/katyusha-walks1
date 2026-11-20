-- Расширение существующего каталога. Выполните один раз в Supabase SQL Editor.
-- Миграция не удаляет строки, таблицы, маршруты или политики.
begin;

alter table public.places add column if not exists region text;
alter table public.places add column if not exists city text;
alter table public.places add column if not exists address text;
alter table public.places add column if not exists price_min numeric(12,2);
alter table public.places add column if not exists price_max numeric(12,2);
alter table public.places add column if not exists price_unit text;
alter table public.places add column if not exists review_count integer;
alter table public.places add column if not exists opening_hours text;
alter table public.places add column if not exists phone text;
alter table public.places add column if not exists map_url text;
alter table public.places add column if not exists source_urls text[] not null default '{}';

create index if not exists places_region_idx on public.places (region);
create index if not exists places_region_category_idx on public.places (region, category);
create index if not exists places_rating_idx on public.places (rating);

commit;
