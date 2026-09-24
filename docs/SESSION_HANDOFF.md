# OGNA map: session hand-off

A condensed record of the first working session (22–24 September 2026), where the organizer map was designed and
built and the public site was planned, and of the second (24 September 2026), which reviewed ourgilroy.com (§7). **Decisions marked ✅ are the organizer's (the user's).** Don't re-plan
them; build on them. Background on OGNA itself is in [`OGNA_CONTEXT.md`](OGNA_CONTEXT.md).

---

## 1. Project and background

- **OGNA (Oldtown Gilroy Neighborhood Alliance)** is a proposed federation of small, block-scale neighborhood
  associations in and around downtown Gilroy, CA, following Jane Jacobs' street → district → city model.
  Neighborhoods may overlap. Motto ideas: *"Organize at the smallest level that makes sense; cooperate at the
  largest level necessary"* and *"Know your neighbors. Organize your neighborhood. Connect it to Oldtown."*
- The user already had **densitymap** (github.com/jelloshooter848/densitymap), a static Leaflet map of census
  tracts. This repo (**jelloshooter848/ogna-map**) forked and trimmed it into a lot-level organizing tool.
- **District boundary (✅):** US 101 on the east, Miller Ave / Princevalle St on the west, Leavesley Rd / Welburn
  Ave on the north, 10th St on the south.
- **Property tax Q&A:** tax bills are public, but California counties publish them one lot at a time, not as a
  free bulk file. Bulk options: buy the Assessor's secured roll file, or file a California Public Records Act
  request with the Tax Collector (draft in [`pra_request.md`](pra_request.md)). ✅ The map estimates tax from
  assessed values until a real roll is imported.

## 2. The organizer map (built and live)

Live at **https://oldtowngilroy.org/** (currently the organizer map sits at the root).

- **Model:** lots (parcels) are the unit. 2020 census block counts (people, homes, households, renters, adults)
  are spread over each block's residential lots by housing units. That's an estimate, and groups of lots are more
  reliable than single lots.
- **District plus neighborhoods (✅ can overlap):** each region owns a set of lot numbers (APNs), and a lot can be
  in several. Combined totals and coverage count each lot once. The district is seeded from a polygon traced
  along the boundary streets (OpenStreetMap geometry) and is editable lot by lot.
- **Stats:** each neighborhood is compared with the district and all of Gilroy. Land is gross acres, streets
  included, so densities compare with the city.
- **Neighborhood details:** status (idea, forming, active, dormant), meeting time, coordinators and contact
  (private), notes.
- **Shading:** residents per acre, homes per acre, residents per lot, renter share, land use, year built, year of
  last sale, building/lot ratio, property tax, tax per sq ft, neighborhood coverage. Each can show per lot or per
  block.
- **Tax import (✅ local only):** CSV imported in the browser; owner and other columns are discarded, and the data
  is kept in IndexedDB. It is never committed or uploaded.
- **Saving (✅):** the user saves with the **Save browser** button in Edit mode. Autosave was proposed and
  declined. Export JSON / Import JSON move work between browsers; **Export public** omits coordinators and
  contacts.
- **Exports:** map and legend PNGs, plus a **Neighborhood sheet** (one neighborhood and its comparison table) for
  starter kits.

## 3. Data

| Source | Notes |
|---|---|
| **City of Gilroy parcel layer** `services8.arcgis.com/n7NW5ijV4dJUmrID/.../Parcels_view/FeatureServer/0` | County assessor data as of May 2024. About 10,300 lots in the Oldtown box: address, assessor use code, units, year built, building size and floors, zoning, General Plan designation, last-sale year, Mills Act style, flood zone, government ownership. No assessed values, no owner names. |
| **Assessor use codes** | 1 single family, 2 duplex, 3 triplex, 4 apartments, 5 other multi-unit, 6 condo, 7 mobile-home park; everything else non-residential. Matched exactly, since 16 is not 1. See `js/config.js`. |
| **2020 census blocks** | TIGER `tabblock20` (population, homes) plus Census API DHC/P.L. (households, renters, adults). Gilroy totals **59,520 people** exactly. |
| **Census API key** | Stored as the repository secret `CENSUS_API_KEY` (✅ done). |
| **City Council districts** (planned) | The six district boundaries (in effect since December 2025). The City's lookup map is an ArcGIS experience (`experience.arcgis.com/experience/f9345053b06745fea301ee6f3a8995d8`); find the FeatureServer behind it when building, and have the *Build data* Action fetch it. A public boundary with no personal data. For the public site's "Your City Council district" (§5). |

- **Build:** the *Build data* GitHub Action (`scripts/build_gilroy.mjs`, settings in `scripts/sources.json`) runs
  on GitHub's machines and commits `data/` back. It triggers on pushes to the scripts or workflow, or runs
  manually. Cloud sessions can't reach census.gov or the GIS hosts directly.
- **Draft district figures:** about 15,900 residents, 4,370 households, **61% renters (39% citywide)**, 3.65
  people per household, 13.5 residents per acre (5.6 citywide).

## 4. Hosting

- GitHub Pages builds from branch **`claude/ogna-density-map-fp8a4s`** (also the repo's default branch), root
  folder. Every push updates the site.
- Custom domain **oldtowngilroy.org** (Namecheap): four A records to 185.199.108–111.153, and `www` as a CNAME to
  `jelloshooter848.github.io`. The `CNAME` file is in the repo; don't delete it. Pending: tick **Enforce HTTPS**,
  and optionally verify the domain with GitHub and add AAAA records.
- The public repo holds only public data. Private things (tax roll, contacts, saved edits) live in the user's
  browser.

## 5. Public site: decisions

- ✅ **Same repo, second front end.** A separate, simpler, read-only site sharing `data/`, the build Action and the
  DOM-free modules (`js/units.js`, `js/stats.js`, `js/state.js`). Not a "public mode" of the organizer map and not
  a separate app. **Public site at the root of oldtowngilroy.org, organizer map moved to `/organize/`.**
- ✅ **Publishing:** neighborhood data reaches the public site only through the organizer map's **Export public**
  file, committed to the repo.
- ✅ **Bilingual (English and Spanish) from the first version.**
- ✅ **No demographic numbers on the public site:** no residents, renters, density or households, and nothing per
  lot (no tax, sale year, year built, APNs). The user felt these would read as creepy.
- **Remove from the public version:** all editing tools; anything tax-related; per-lot data; coverage numbers and
  status chips; coordinator contacts; the full export composer, replaced by a simple "print this neighborhood".
- **Add:**
  - address search, "Which neighborhood am I in?" (the core feature);
  - a page per neighborhood with a shareable link: description, photo, meeting time, how to join (a form link,
    not personal emails);
  - unorganized areas shown as an invitation to start a group, linked to the starter kit;
  - mobile-first design, since most visitors arrive from flyers and QR codes;
  - parks, schools, library and transit from OpenStreetMap;
  - local shops (coordinate with the GDRA "Shop Downtown Gilroy" directory rather than duplicate it);
  - an events list with map pins;
  - historic Mills Act homes as a possible walking-tour layer;
  - OGNA meetings and positions, including where neighborhoods disagree;
  - a **"Gilroy by the numbers"** block on the Resources page linking every OurGilroy dashboard (§7), marked
    "(English)" on the Spanish site;
  - on each neighborhood page, **"Your City Council district"**: which district(s) it is in, with links to the
    City's and County's voter pages and to OurGilroy's page for that district (✅, §7);
  - on each neighborhood page, **"City projects nearby"**: links to OurGilroy's capital and development project
    pages. These are rows in the Sheet's **Resources** tab, which gets an optional **neighborhood** column (blank
    means sitewide), so they are edited in the Sheet like everything else.
- ✅ **Amenities and shops are in the first version.** They are edited in the Google Sheet, **not in the organizer
  map**, because the organizer map saves only to one browser. The organizer map edits only boundaries.
- ✅ **Content is managed in Google Sheets:**
  - one shared Sheet, "OGNA public content", with tabs **Neighborhoods** (map id, name, description EN/ES, meets,
    join link, photo), **Events** (date, time, title EN/ES, address, neighborhood, link, approved), **Places**
    (name, category, address, description EN/ES, website, approved) and **Resources** (title EN/ES, link,
    category);
  - coordinators and volunteers edit their own rows (Sheets keeps version history);
  - residents suggest items through a **Google Form** that feeds a *Suggestions* tab; an admin approves;
  - only rows with **approved** checked go public;
  - the content tabs are published as CSV, and a GitHub Action runs **hourly** (or on demand) to read them,
    geocode addresses with the free Census geocoder, drop bad or unapproved rows, report problems and commit the
    result, so the site never breaks on a bad row;
  - a blank Spanish cell falls back to English and is flagged "translation needed".
- ✅ The user bought **oldtowngilroy.org** (see §4).

## 6. City of Gilroy website and services

✅ Principle: **link to and reuse the City's existing tools; don't rebuild them.**

| City tool | What it is | Plan |
|---|---|---|
| **GilroyConnect** (SeeClickFix) https://seeclickfix.com/gilroy | The City's issue reporting: potholes, graffiti, code violations, streetlights, parks. Routes to the right department. | A **"Report an issue to the City"** button on each neighborhood page. Don't build our own request counts: OurGilroy's Service Requests dashboard (`ourgilroy.com/scf.php`) already analyzes them, so link to it (§7). |
| **Parks & Rec: CivicRec** https://secure.rec1.com/CA/gilroy-ca/catalog | Class and program registration (payment and waivers stay with the City) | Link out, filtered by location where possible ("classes at this park"). Add a "Reserve this park" link on park pins (https://www.cityofgilroy.org/recreation). |
| **City calendar (CivicPlus)** https://www.cityofgilroy.org/Calendar.aspx | Community events and council meetings, with "Notify Me" alerts | Pull City events into the events list, labeled "City of Gilroy", if the iCal/RSS feeds exist (to verify). |
| **Council agendas (CivicClerk)** https://gilroyca.portal.civicclerk.com/ | Agendas, minutes, video | Link to upcoming meetings, and to OurGilroy's council dashboard (`ourgilroy.com/council.php`), whose Map tab already places agenda items that name an address. Flagging Oldtown items on the OGNA site waits on the OurGilroy partnership (§7). |
| **Planning Project Locations** (City ArcGIS, services8.arcgis.com, owner castanonk) | Development projects | Map layer: projects near each neighborhood. For project details, link readers to OurGilroy's development dashboard (`ourgilroy.com/development.php`). |
| **City parcel layer** | Already powers the organizer map | See §3. |

## 7. ourgilroy.com

- A Gilroy civic website **created by one of the City councilmembers**. Reviewed on 24 September 2026.
- **What it is:** "OurGilroy — Gilroy, by the numbers", independent dashboards built from public data. Its footer
  says it isn't affiliated with the City. English only. Contact: hello@ourgilroy.com. Its dashboards, with the
  links that stay stable:

| Dashboard | Source | Links |
|---|---|---|
| **Elections** | City, County, NetFile filings, news | `elections.php`; `election_district.php?d=1`…`6`; `election_measure.php?slug=…`. Gilroy's first district council election is 3 Nov 2026 (Districts 4–6; Districts 1–3 and the Mayor in 2028). |
| **Capital Projects** | Capital Improvement Program, budget, Council records | `capital.php`; `capital_project.php?id=N`. In or near Oldtown: Civic Center Master Plan (6th/7th, Dowdy–Church, id 121), Library renovation (350 W 6th St), Monterey St crossing near Tenth. |
| **Development Activity** | Planning Division project log | `development.php` (list, timeline, map) |
| **City Service Requests** | GilroyConnect / SeeClickFix | `scf.php` (volumes, time to close, map) |
| **Crime** | CitizenRIMS arrests | `crime.php` (includes a "Top Arrested" list of named people) |
| **Fire & EMS** | PulsePoint | `fire.php` |
| **City Council** | CivicClerk / PrimeGov | `council.php`; `council.php?meeting=ID`. Meetings, votes, member records, and a Map tab of agenda items that name an address. |

- There are no area filters in its links (only ids and district numbers), so there is no ready-made "Oldtown view".
- Its `robots.txt` disallows `/api/` and `/data/`. **Don't pull its JSON**; any data feed comes through a
  partnership.
- ✅ **Link all its dashboards** from the public site (the "Gilroy by the numbers" block, §5), crime and fire
  included. **Show none of their data** on the OGNA site; the no-demographics, no-per-lot rule (§5) stands.
- ✅ **Elections:** neighborhood pages state which council district(s) the neighborhood is in and link to the
  City's and County's voter pages and to OurGilroy's `election_district.php?d=N`. The OGNA site itself lists no
  candidates.
- **Partnership ask (not yet made):** offer OGNA's district and neighborhood boundaries as GeoJSON in exchange for
  (a) an Oldtown or boundary filter on the council map, development and service-request dashboards, (b) permission
  to use a feed of upcoming council meetings and Oldtown agenda items, and maybe (c) Spanish labels. Nothing waits
  on this: the first version works with plain links.

## 8. Open items

- The district's **west edge**: Miller Ave draws a tail to the southwest; the user may prefer Princevalle for the
  southern stretch. ✅ The user will adjust it in the app after launch.
- Serve the organizer map at `oldtowngilroy.org/organize/` or only elsewhere?
- "Oldtown" or "Old Town"; a logo.
- A Spanish-speaking volunteer to review translations.
- Will OGNA ever endorse candidates or measures, or only take policy positions? Linking OurGilroy's election
  pages (§7) should stay neutral: the same links for every district, no candidate content of our own.
- Contact the OurGilroy maintainer (hello@ourgilroy.com) with the partnership ask in §7.
- Which council district(s) cover Oldtown: confirm once the district layer (§3) is built.
- Later ideas: a transit layer (Caltrain, VTA, the planned high-speed rail station); ACS block-group layers for
  the organizer map only; traffic collision data.

## 9. Working in this repo

- Work and push only on **`claude/ogna-density-map-fp8a4s`** (the Pages branch).
- The repo is public: **never commit** tax or assessor files, owner names, or coordinator contacts.
- Tests:
  - `npm test` (model);
  - `node scripts/make_fixture.mjs && node test/browser.mjs` (end to end on synthetic data);
  - `node test/real_smoke.mjs` (real data).
  CDNs and map tiles are blocked in cloud sessions, so the browser tests serve the libraries from
  `node_modules` and use Chromium at `/opt/pw-browsers`.
- The user isn't a developer: explain GitHub, Namecheap and settings steps click by click, and confirm before
  anything destructive.
