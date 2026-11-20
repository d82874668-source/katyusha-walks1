# Прогулки с Катюшей — Webflow build

The Webflow presentation is a single-page application (SPA) backed by the existing Supabase `public.places` table. The app uses the project's publishable key and the existing public SELECT policy. No service-role key or private credential is included.

## Views

All views are rendered inside one app shell and routed through the query string:

- `/` — home
- `/?view=discover` — searchable catalogue
- `/?view=routes` — city-based route ideas
- `/?view=create-route` — personal route builder (saved in localStorage)
- `/?view=about` — project information

The internal navigation stays on the root URL and changes the `view` parameter. Search filters and place details use additional query parameters.

## Webflow Cloud

A separate `webflow-cloud` branch contains a static app entry point at the repository root:

- `index.html` — app shell and metadata
- `webflow.json` — explicit static framework configuration
- `webflow/katyusha.css` — responsive design system
- `webflow/katyusha.js` — app logic, Supabase loading, search, filters, place details and route builder

The Cloud app is standalone so it does not depend on the static-page publishing limit of the regular Webflow site. The GitHub App integration must be installed for the Webflow workspace before Webflow Cloud can import the repository and deploy the branch.

## Regular Webflow Designer

The Designer site remains a separate presentation layer. The home page embed loads the same CSS and JS from jsDelivr. Secondary pages are retained as drafts; the SPA provides all five views from the root page.

## Production safety

The original GitHub Pages application and its main branch remain separate and untouched by the Webflow Cloud branch. Do not switch the primary domain until the standalone Cloud deployment has been published and checked on desktop and mobile.
