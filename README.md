# Terrassa Buses on Schedule

A map with moving markers showing TMESA buses. Positions are estimated based on the GTFS schedule; they are not real-time data from actual buses.

## Local development

Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `.env.debug.local` (this file is ignored by Git), or export them in the shell. Then run:

```sh
npm run dev
```

Open http://127.0.0.1:5173. The page and its client modules are rebuilt when application code, `map_template.html`, `styles.css`, or a translation file changes; refresh the browser to see the update. Set `PORT` or `HOST` to change the local address.

Translations live in `src/i18n/es.json` and `src/i18n/ca.json`. Keep the same keys in both files when adding interface text. The language selector switches between Spanish and Catalan and remembers the selection in the browser.

## Production build

With the same Supabase settings available, run `npm run build`. The publishable page and its required client assets are written to `public/`.

## Bus route geometry

Schedule updates download OSM road ways around the GTFS stops from Overpass and build a local shortest-distance graph for buses before writing feeds to Supabase. Bus-specific `bus` and `psv` access tags take precedence over general `access` restrictions, so `access=no` with `psv=yes` remains available to buses. Bus-specific one-way tags are applied before the general `oneway` tag. The generated path is stored once per unique ordered stop sequence and reused by trips with the same stops.

Schedule updates first prepare and validate every OSM route in `.staging/`, then persist the validated feeds to Supabase in one upsert. Use `npm run update:schedules` for both stages or `npm run prepare:schedules` and `npm run persist:schedules` separately with the same run id. The GitHub workflow runs the stages separately; failed preparation leaves Supabase unchanged. OSM data is provided by the [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) under the ODbL.
