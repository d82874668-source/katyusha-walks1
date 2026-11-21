-- Retire the removed personal collection and visit journal.
-- Verified before applying: public.favorites=0 rows, public.place_visits=0 rows,
-- storage bucket visit-photos=0 objects. The catalogue and place galleries are untouched.
begin;

drop policy if exists "favorites deny public access" on public.favorites;
drop policy if exists "favorites read" on public.favorites;
drop policy if exists "favorites insert" on public.favorites;
drop policy if exists "favorites delete" on public.favorites;
drop table if exists public.favorites;

drop policy if exists "visits read own" on public.place_visits;
drop policy if exists "visits insert own" on public.place_visits;
drop policy if exists "visits update own" on public.place_visits;
drop policy if exists "visits delete own" on public.place_visits;
drop table if exists public.place_visits;

drop policy if exists "visit photos read own" on storage.objects;
drop policy if exists "visit photos upload own" on storage.objects;
drop policy if exists "visit photos update own" on storage.objects;
drop policy if exists "visit photos delete own" on storage.objects;
-- The empty private Storage bucket is retained: Supabase protects storage tables from direct SQL deletion.
-- Its policies are removed above, so no client can access it. Delete it later via the Storage API if desired.

commit;
