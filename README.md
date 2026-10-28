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
node build_map.mjs --no-summer --out index.html
```

The Terrassa open data portal currently returns Cloudflare 403 errors to GitHub Actions. The main GTFS archive is downloaded directly from the official Spanish NAP feed for TMESA. NAP requires an API key, passed as the `ApiKey` request header; set `NAP_API_KEY` in the local environment when running the script.

## Deployment
Go to Settings → Pages → Source: GitHub Actions. Register for an API key through the [NAP API instructions](https://nap.transportes.gob.es/Account/InstruccionesAPI), then add a repository Actions secret named `NAP_API_KEY`. The workflow passes this secret only to the build step. Finally, open Actions → “Update Bus Map” → Run workflow.

## Schedules and Dates
For the selected date, the script uses the archive whose validity period in `calendar.txt` covers that date. If no such archive is available, it falls back to the main archive for the corresponding day of the week, with a notice displayed on the map.

**Map layers:** Esri and OpenStreetMap work without an API key. Mapbox requires a public token, which can be entered in the field on the page and is stored in the browser.
