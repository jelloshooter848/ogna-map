# OGNA public site: decisions already made

Decisions the organizer made in the planning session that built the organizer map (September 2026).
Read this together with [`PUBLIC_SITE_PLAN.md`](PUBLIC_SITE_PLAN.md), the plan written in the next session;
where the two disagree, these decisions win unless the organizer says otherwise.

## Settled

1. **One repo, a second front end.** The public site is a separate, simpler, read-only page set in this repo.
   It is not a "public mode" of the organizer map, and not a separate app. It shares `data/`, the build
   Action and the no-DOM modules (`js/units.js`, `js/stats.js`, `js/state.js`). Public site at the root of
   **oldtowngilroy.org** (live on GitHub Pages as of 2026-09-24); organizer map moves to `/organize/`.
2. **Publishing boundaries:** the organizer map's **Export public** file (no coordinators or contacts) is
   committed and is the only neighborhood data the public site reads.
3. **Bilingual (English / Spanish) from the first version**, not later. UI strings translated once up front;
   content has EN and ES columns (see 6).
4. **No demographic numbers on the public site.** No residents, renters, density or household figures for
   neighborhoods, and nothing per lot (no tax, year built, sale year, APNs). The organizer decided these read
   as creepy to residents. Neighborhood profiles are descriptive text only (name, description, meets, how to
   join). *(This overrides PUBLIC_SITE_PLAN.md §4's "neighborhood totals are fine" and the home-page coverage
   number, unless the organizer revisits it.)*
5. **Link to city services, don't rebuild them:**
   - **Report an issue:** GilroyConnect (SeeClickFix), https://seeclickfix.com/gilroy. A button on each
     neighborhood page. Later, maybe show open request counts via the SeeClickFix public API (unverified).
   - **Parks & Rec classes and sign-ups:** City CivicRec catalog, https://secure.rec1.com/CA/gilroy-ca/catalog,
     and park reservations (https://www.cityofgilroy.org/recreation). Link from park pins and neighborhood
     pages, filtered to nearby locations where the catalog allows.
   - **City calendar and council agendas:** CivicPlus calendar (https://www.cityofgilroy.org/Calendar.aspx),
     CivicClerk (https://gilroyca.portal.civicclerk.com/). Pull city events via iCal/RSS if the feeds exist
     (unverified).
   - **Planning projects:** the City's "Planning Project Locations" ArcGIS layer (services8.arcgis.com,
     owner castanonk) found during the parcel search.
   - **ourgilroy.com:** link to its dashboards; ask about an Oldtown view (see PUBLIC_SITE_PLAN.md §1).
6. **Content is edited in one Google Sheet, not in the organizer map and not in JSON files.** The organizer
   map only edits things that need a map (neighborhood and district boundaries). Everything textual lives in
   a shared Sheet:
   - **Tabs:** *Neighborhoods* (map id, name, description EN/ES, meets, join link, photo link); *Events*
     (date, time, title EN/ES, address, neighborhood, link, approved); *Places* (name, category such as
     park / shop / school / service, address, description EN/ES, website, approved); *Resources* (title
     EN/ES, link, category).
   - **Who edits:** coordinators and volunteers have edit access to their own rows (Sheets keeps version
     history). Any resident can suggest items through a Google Form that feeds a *Suggestions* tab; an OGNA
     admin approves. Only rows with **approved** checked go public.
   - **How it reaches the site:** the content tabs are published as CSV. A GitHub Action runs **hourly** (plus
     "Run workflow" for urgent changes): it reads the CSVs, geocodes addresses with the Census geocoder, drops
     unapproved or broken rows, reports problems, and commits the result. The site never breaks on a bad row.
   - **Spanish:** a blank ES cell falls back to EN and is flagged "translation needed".
   - This replaces the `events.json` / Google Calendar and hand-edited JSON options in PUBLIC_SITE_PLAN.md
     §3 and §5. A Google Calendar embed can still be offered as an extra view.
7. **Amenities and local shops are in scope for the first version** (Places tab plus OpenStreetMap parks,
   schools, library, transit). For shops, coordinate with the GDRA "Shop Downtown Gilroy" directory rather
   than duplicate it.
8. **Mobile first.** Most visitors arrive from a flyer or QR code.
9. **Address search "Which neighborhood am I in?"** is the core feature; unorganized areas invite residents
   to start a group (starter kit).

## Still open
- Organizer map at `oldtowngilroy.org/organize/` or only on the github.io address.
- Endorsement policy (PUBLIC_SITE_PLAN.md §7.2).
- "Oldtown" vs "Old Town"; logo.
- A Spanish-speaking reviewer for translations.
