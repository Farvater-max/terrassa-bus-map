# Terrassa Buses on Schedule

A map with moving markers showing TMESA buses. Positions are estimated based on the GTFS schedule; they are not real-time data from actual buses.

## Files
- `build_map.mjs` — build script: downloads GTFS data and generates the page
- `app.js` — map application code
- `map_template.html` — HTML markup and styles
- `.github/workflows/update-map.yml` — weekly rebuild and deployment to GitHub Pages

## Running Locally
```bash
npm install
SUPABASE_URL=... SUPABASE_SERVICE_KEY=... SUPABASE_ANON_KEY=... node build_map.mjs --no-summer --out index.html
```

The build downloads GTFS from the Spanish NAP, converts it into compact JSON, and upserts it into the Supabase `feeds` table through the Supabase Data API. The generated page reads the JSON with the public key; database access is protected by the table's row-level security policy. No Vite bundling is needed for this static page.

## Deployment
Go to Settings → Pages → Source: GitHub Actions. Add repository Actions secrets named `NAP_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, and `SUPABASE_ANON_KEY`. `NAP_API_KEY` authorizes the GTFS download. The Supabase service key is only used by the build step; the anon key is public by design and is embedded in the generated page. Then open Actions → “Update Bus Map” → Run workflow.

## Schedules and Dates
For the selected date, the script uses the archive whose validity period in `calendar.txt` covers that date. If no such archive is available, it falls back to the main archive for the corresponding day of the week, with a notice displayed on the map.

**Map layers:** Esri and OpenStreetMap work without an API key. Mapbox requires a public token, which can be entered in the field on the page and is stored in the browser.
