# Прогулки с Катюшей — Webflow build

This folder contains the custom front-end embedded into the Webflow pages. The app reads public place records from the existing Supabase `public.places` table using the project's publishable key and the existing public SELECT policy. No service-role key or private credential is included.

## Pages
- `/` — home
- `/discover` — searchable catalogue
- `/routes` — city-based route starting points
- `/create-route` — personal route builder (saved in localStorage)
- `/about` — project information

Each Webflow page embeds a `#katyusha-app` mount with its `data-page` value and loads `katyusha.css` and `katyusha.js` from jsDelivr. Update these source files in GitHub and bump the query version in the Webflow embed when shipping changes.

The original GitHub Pages application remains separate and untouched.