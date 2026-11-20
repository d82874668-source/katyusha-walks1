-- Security and query-plan hardening after the initial feature migrations.
-- No user data is deleted. Public favourites sync is disabled until account-based ownership is implemented.

begin;

-- SECURITY DEFINER is not needed for is_admin(): the caller can read only their own
-- admin_users row through the existing RLS policy.
create or replace function public.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users
    where user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- The audit trigger runs as the updating administrator. Its insert is explicitly
-- authorized by RLS instead of relying on a publicly executable SECURITY DEFINER.
alter function public.log_place_changes() security invoker;
revoke all on function public.log_place_changes() from public, anon, authenticated;
grant insert on public.place_history to authenticated;
drop policy if exists "admin history insert" on public.place_history;
create policy "admin history insert" on public.place_history
  for insert to authenticated
  with check ((select public.is_admin()));

-- Trigger-only helper functions should not be exposed as callable RPC endpoints.
revoke all on function public.set_place_updated_at() from public, anon, authenticated;

-- Replace FOR ALL policies with per-operation policies; public SELECT remains unchanged.
drop policy if exists "places admin write" on public.places;
drop policy if exists "places admin insert" on public.places;
drop policy if exists "places admin update" on public.places;
drop policy if exists "places admin delete" on public.places;
create policy "places admin insert" on public.places
  for insert to authenticated with check ((select public.is_admin()));
create policy "places admin update" on public.places
  for update to authenticated using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "places admin delete" on public.places
  for delete to authenticated using ((select public.is_admin()));

drop policy if exists "place photos admin write" on public.place_photos;
drop policy if exists "place photos admin insert" on public.place_photos;
drop policy if exists "place photos admin update" on public.place_photos;
drop policy if exists "place photos admin delete" on public.place_photos;
create policy "place photos admin insert" on public.place_photos
  for insert to authenticated with check ((select public.is_admin()));
create policy "place photos admin update" on public.place_photos
  for update to authenticated using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "place photos admin delete" on public.place_photos
  for delete to authenticated using ((select public.is_admin()));

-- Cache auth.uid() once per statement in ownership policies.
drop policy if exists "admin self" on public.admin_users;
create policy "admin self" on public.admin_users
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "visits read own" on public.place_visits;
create policy "visits read own" on public.place_visits
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "visits insert own" on public.place_visits;
create policy "visits insert own" on public.place_visits
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "visits update own" on public.place_visits;
create policy "visits update own" on public.place_visits
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
drop policy if exists "visits delete own" on public.place_visits;
create policy "visits delete own" on public.place_visits
  for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists "visit photos read own" on storage.objects;
create policy "visit photos read own" on storage.objects
  for select to authenticated using (
    bucket_id = 'visit-photos' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
drop policy if exists "visit photos upload own" on storage.objects;
create policy "visit photos upload own" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'visit-photos' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
drop policy if exists "visit photos update own" on storage.objects;
create policy "visit photos update own" on storage.objects
  for update to authenticated using (
    bucket_id = 'visit-photos' and (storage.foldername(name))[1] = (select auth.uid())::text
  ) with check (
    bucket_id = 'visit-photos' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
drop policy if exists "visit photos delete own" on storage.objects;
create policy "visit photos delete own" on storage.objects
  for delete to authenticated using (
    bucket_id = 'visit-photos' and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Prevent visitors from reading or changing the old global favourites table.
-- The site now keeps favourites locally until a real per-account sign-in flow exists.
drop policy if exists "favorites read" on public.favorites;
drop policy if exists "favorites insert" on public.favorites;
drop policy if exists "favorites delete" on public.favorites;
revoke all on table public.favorites from anon, authenticated;

-- Cover foreign keys used by joins, deletes and review queues.
create index if not exists place_external_ids_place_id_idx on public.place_external_ids(place_id);
create index if not exists place_history_place_id_idx on public.place_history(place_id);
create index if not exists place_ratings_source_id_idx on public.place_ratings(source_id);
create index if not exists place_review_queue_matched_place_id_idx on public.place_review_queue(matched_place_id);
create index if not exists place_review_queue_source_id_idx on public.place_review_queue(source_id);
create index if not exists place_visits_place_id_idx on public.place_visits(place_id);
create index if not exists sync_logs_source_id_idx on public.sync_logs(source_id);

commit;
