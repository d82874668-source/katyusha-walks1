-- Explicit restrictive deny rule for the retired global favourites endpoint.
-- There is intentionally no permissive policy and no table grant for anon/authenticated.
drop policy if exists "favorites deny public access" on public.favorites;
create policy "favorites deny public access" on public.favorites
  as restrictive for all to anon, authenticated
  using (false) with check (false);
