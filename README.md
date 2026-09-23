# OGNA Neighborhood Map

**Open the map: https://jelloshooter848.github.io/ogna-map/**

An organizing map for the **Oldtown Gilroy Neighborhood Alliance**: the Oldtown district, the small
neighborhood associations inside it (which may overlap), and who lives on each lot. The map is built from
[densitymap](https://github.com/jelloshooter848/densitymap), but works with lots and census blocks instead
of census tracts. Background on OGNA is in [`docs/OGNA_CONTEXT.md`](docs/OGNA_CONTEXT.md).

## What it does

- **Lots and blocks.** Every Santa Clara County parcel around Oldtown, plus every 2020 census block in
  Gilroy. Each block's population, homes, households and renters are spread over its residential lots, so
  any set of lots gets estimated numbers.
- **District and neighborhoods.** The district is a region like any other and can be edited lot by lot. A
  lot can belong to any number of neighborhoods. Combined figures (coverage, "shown neighborhoods") count
  each lot once.
- **Coverage.** Shows the share of the district's residents who live in at least one neighborhood. The
  *Neighborhood coverage* shading marks district lots that no neighborhood covers yet.
- **Details and comparison.** Click a name in the list to compare that neighborhood with the district and
  all of Gilroy. The same card holds its status (idea, forming, active, dormant), meeting time, coordinators,
  contact and notes.
- **Shading.** Color lots or blocks by residents per acre, homes per acre, residents per lot, renter share,
  land use, year built, property tax, tax per square foot of lot, or neighborhood coverage.
- **Property tax.** Import the county tax roll as a CSV. It stays in your browser (see *Privacy*). Without
  it, tax figures show "—". A file with only assessed values gets estimated tax.
- **Exports.** Region-set JSON (full, or *public* without coordinators and contacts), a browser save that is
  restored automatically, map/legend PNGs, and a **Neighborhood sheet** (one neighborhood plus its
  comparison table) for a starter kit.

## Running it

The live site is **https://jelloshooter848.github.io/ogna-map/**, served by GitHub Pages from this branch; every push updates it. Your neighborhood edits and any imported tax roll stay in your browser, not on the site.

To run it locally instead: it's a static site with no build step, but browsers block `fetch()` from `file://`, so serve the folder:

```
python3 -m http.server 8000      # or: npm run serve
# open http://localhost:8000/
```

To try it before the real data exists, run `node scripts/make_fixture.mjs` and open
`http://localhost:8000/?data=test/fixture/`. That loads a synthetic street grid with about 6,000 lots.

Libraries (Leaflet 1.9.4, Turf 7.4, html2canvas 1.4.1) load from pinned CDN URLs. `window.app` exposes the
state and stats modules for debugging.

## Data

| File | Contents | Built by |
|------|----------|----------|
| `data/parcels.json` | Lots around Oldtown from the City of Gilroy parcel layer (assessor data as of 2024): APN, census block, lot size, address, assessor use code, units, year built, building size and floors, zoning, General Plan designation, last-sale year, Mills Act style, flood zone, government ownership. No owner names, no values. | `scripts/build_gilroy.mjs` |
| `data/blocks.json` | 2020 census blocks in and around Gilroy: population and housing units (TIGER `POP20`/`HOUSING20`), occupied and renter-occupied units (DHC H3/H4), adults (P.L. 94-171 P3), land acres, `in_city` flag | same |
| `data/city_limits.json` | Gilroy place boundary (TIGER/Line 2020) | same |
| `data/sources/build_report.json` | What each build stage did, sanity checks (Gilroy population from blocks vs. 59,520), and the parcel layer's field inventory and land-use codes | same |
| `data/sources/boundary_streets.geojson` | OpenStreetMap geometry of the district's boundary streets, for drawing the district | same |
| `data/regions/oldtown.json` | The shipped region set: the district, seeded from a rough polygon along Hwy 101, Miller Ave / Princevalle St, Leavesley Rd / Welburn Ave and 10th St | hand-edited |

**Building the data.** The **Build data** GitHub Action (`.github/workflows/build-data.yml`) runs
`scripts/build_gilroy.mjs` on a GitHub runner. It starts on any push that changes the script,
`scripts/sources.json` or the workflow, and commits the outputs back to the same branch. Locally,
`npm install && npm run build:data` does the same if your network can reach census.gov, arcgis.com and
data.sccgov.org. The script finds the county parcel layer through the ArcGIS Hub and Socrata catalogs; to
pin a specific layer or field names, set `parcels.arcgis_layers` / `parcels.fields` in `scripts/sources.json`.

### How the estimates work

- **Residents per lot.** Each block's 2020 counts are split among its lots by housing units. The split uses
  the parcel's unit count when the county has one, otherwise a default by land use (single family 1, duplex 2,
  apartments by lot size…; see `UNIT_WEIGHTS` and `USE_RULES` in `js/config.js`). Non-residential lots get
  none. If a block has people but no lot looks residential, its counts are split by lot area. Block totals
  are always preserved.
- **Land and density.** Land is **gross acres**. Each lot carries its share of the block's land area, streets
  included, so neighborhood densities are comparable with the whole-city benchmark.
- **Accuracy.** The Census Bureau adds deliberate noise to block-level counts (differential privacy).
  Single blocks, and even more so single lots, can be off. Totals over several blocks are reliable.
- **Tax.** An imported *total tax* column is used as is. With only assessed values, tax is (land +
  improvements − exemptions) × `EST_TAX_RATE` (1.18%, a typical Gilroy tax-rate-area rate). That leaves out
  special assessments and direct charges. Per-resident and per-square-foot tax figures use only the lots
  that have tax data.

## Privacy

This repository is public. Keep it that way for code and public data only:

- **Tax and assessor files are never committed.** Load them in the app. Only APNs and the dollar columns you
  map are kept, in the browser's IndexedDB; owner names and every other column are discarded when the file is
  read. `.gitignore` excludes `*.csv`, `*.xlsx`, `*.xls` and `private/`.
- **Coordinators and contacts** are saved in the browser and in *Export JSON*. Use **Export public** for any
  file that will be shared widely or committed.
- To get the actual tax roll, see the draft Public Records Act request in
  [`docs/pra_request.md`](docs/pra_request.md).

## Region-set file format (6.0)

```json
{
  "format_version": "6.0",
  "units": "apn",
  "name": "Oldtown Gilroy",
  "regions": [
    { "id": 1, "kind": "district", "name": "Oldtown", "color": "#1a202c", "status": "active", "members": ["84101001", "…"] },
    { "id": 2, "kind": "neighborhood", "name": "Church Street", "color": "#2b6cb0", "status": "forming",
      "meets": "2nd Tuesday, 7pm", "notes": "Speeding on Church", "members": ["84101001", "…"] }
  ]
}
```

Members are APNs with punctuation removed. A lot may appear in several regions. Statistics are never stored;
they are recomputed from the data files. A region may carry a `seed_polygon` (lon/lat ring) instead of
members; on load it gets the lots whose center falls inside.

### Census API key (for households, renters and adults)

Population and housing units come from the TIGER block file and need no key. Households, renter
households and adults come from the Census API, which now requires a free key:

1. Request one at <https://api.census.gov/data/key_signup.html>.
2. In GitHub: **Settings → Secrets and variables → Actions → New repository secret**, name
   `CENSUS_API_KEY`.
3. Re-run **Build data** (Actions tab → Build data → Run workflow).

Until then those rows show "—".

## Tests

```
npm test                                           # model: allocation, overlaps, undo, round trip, tax import
node scripts/make_fixture.mjs && node test/browser.mjs   # end to end in headless Chromium
node test/real_smoke.mjs                                 # loads the real data/, prints district totals
```

## Layout

```
index.html        shell markup
css/app.css
js/
  config.js       URLs, palette, tax rate, land-use rules and unit weights
  units.js        lots and blocks, land-use classification, per-lot estimates, tax lookup (no DOM)
  state.js        district + neighborhoods (many-to-many membership), undo/redo (no DOM)
  stats.js        stats for any set of lots, union totals, coverage, city benchmark (no DOM)
  render.js       Leaflet map, shading, region shapes and labels, modes
  lasso.js        polygon area selection
  ui.js           side panel
  editor.js       edit actions, toolbar, tax-roll import wiring
  taxroll.js      CSV parsing, column mapping, IndexedDB storage
  persist.js      region-set import/export and browser save
  export.js       PNG composer and neighborhood sheet
  main.js         bootstrap
scripts/
  build_gilroy.mjs  data build (run by the GitHub Action)
  sources.json      build settings: boxes, boundary streets, parcel layer discovery
  make_fixture.mjs  synthetic test data
docs/             OGNA background, Public Records Act request draft
```

## Later

- A Gilroy transit layer: Caltrain, VTA, and the planned high-speed rail station (densitymap's
  `js/transit.js` and `scripts/build_transit.mjs` can be ported).
- ACS block-group layers: income, rent burden, language, vehicle access.
- Traffic collision points (TIMS/SWITRS).
- A public-facing version with amenities, stores, events and neighborhood boundaries.

## Attribution

Basemap © OpenStreetMap contributors. Census geometry and counts: U.S. Census Bureau (public domain).
Parcels: County of Santa Clara.
