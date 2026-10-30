# Terrassa Buses on Schedule

A map with moving markers showing TMESA buses. Positions are estimated based on the GTFS schedule; they are not real-time data from actual buses.

## Files
- `scripts/update-schedules.js` — downloads, transforms, and saves GTFS feeds
- `scripts/publish-page.js` — generates the static page
- `src/gtfs/` — GTFS download and transformation modules
- `src/storage/supabaseFeeds.js` — Supabase persistence adapter
- `src/site/renderPage.js` — HTML rendering
- `app.js` — map application code
- `map_template.html` — HTML markup and styles
- `.github/workflows/update-schedules.yml` — weekly GTFS update in Supabase
- `.github/workflows/publish-pages.yml` — page build and deployment

## Running Locally
```bash
npm install
SUPABASE_URL=... SUPABASE_ANON_KEY=... npm run build
NAP_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_KEY=... npm run update:schedules
```

The schedule updater downloads GTFS from the Spanish NAP, converts it into compact JSON, and upserts it into the Supabase `feeds` table through the Supabase Data API. If a feed cannot be downloaded or parsed, the updater leaves the current database rows untouched. The page publisher only generates HTML; the browser reads feed data from Supabase with the public key and the table's row-level security policy. No Vite bundling is needed for this static page.

## Deployment
Go to Settings → Pages → Source: GitHub Actions. Add repository Actions secrets named `NAP_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, and `SUPABASE_ANON_KEY`. `NAP_API_KEY` authorizes the GTFS download. The Supabase service key is only used by the schedule update workflow; the anon key is public by design and is embedded in the generated page. To run an update manually, open Actions → “Update bus schedules” → Run workflow.

The workflows are separate:
- `Update bus schedules` runs weekly and updates the `feeds` table only when it can download and parse GTFS. If download or parsing fails, the database is left untouched, so the page keeps using its current data.
- `Publish bus map` builds and deploys the page on pushes to `main`. A pull request to `main` runs a build check but does not deploy the unmerged code. Merging the pull request triggers the `main` push and publishes it.

## Schedules and Dates
For the selected date, the script uses the archive whose validity period in `calendar.txt` covers that date. If no such archive is available, it falls back to the main archive for the corresponding day of the week, with a notice displayed on the map.

**Map layers:** Esri and OpenStreetMap work without an API key. Mapbox requires a public token, which can be entered in the field on the page and is stored in the browser.
