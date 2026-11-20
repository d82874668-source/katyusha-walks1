-- Explicit Data API grants for projects created after the 2026 default-privileges change.
-- RLS remains the row-level boundary; grants only make the intended endpoints reachable.

begin;

grant usage on schema public to anon, authenticated, service_role;

-- Public read-only catalogue.
grant select on table public.places, public.routes, public.place_photos, public.place_ratings
  to anon, authenticated;

-- Admin-managed catalogue and review tables. RLS policies restrict these writes to admins.
grant insert, update, delete on table public.places, public.place_photos to authenticated;
grant select on table public.admin_users, public.sync_logs, public.place_external_ids, public.place_history
  to authenticated;
grant select, insert on table public.place_history to authenticated;
grant select, insert, update, delete on table public.data_sources, public.place_review_queue
  to authenticated;

-- A visitor can access only their own visit records under the ownership RLS policies.
grant select, insert, update, delete on table public.place_visits to authenticated;

-- Server-side Edge Functions use service_role; never ship this key to the browser.
grant all privileges on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Identity-backed inserts from authenticated admin tools need sequence access.
grant usage, select on all sequences in schema public to authenticated;

-- Public/global favourites are intentionally not exposed; the site uses browser-local favourites.
revoke all privileges on table public.favorites from anon, authenticated;

commit;
