# OGNA public site: plan

Status: draft, 2026-09-24. Continues the "public-facing version" item in the README's *Later* list.
Background on OGNA itself is in [`OGNA_CONTEXT.md`](OGNA_CONTEXT.md).

## 1. What ourgilroy.com already does

[OurGilroy](https://ourgilroy.com) is an independent, citywide civic-data site. It has seven dashboards, and
it says on every page that it is not affiliated with the City and does not endorse candidates or measures.

| Dashboard | Source it scrapes | Useful to OGNA for |
|---|---|---|
| Elections | City, County Registrar, NetFile, news | Nov 3, 2026 council races in Districts 4, 5, 6 |
| Capital Projects | City CIP | Street, park and facility work in Oldtown |
| Development Activity | Planning Division quarterly project log | Projects proposed inside the district |
| City Service Requests | GilroyConnect (SeeClickFix), since 1/1/2025 | Potholes, graffiti, lights, by address |
| Crime | CitizenRIMS arrests | (use with care, see below) |
| Fire & EMS | PulsePoint | — |
| City Council | CivicClerk (PrimeGov before mid-2025) | Agendas, votes, a map of agenda items by address |

None of the dashboards has a public download or API. The contact address is hello@ourgilroy.com.

**What this means for OGNA:**

1. **Don't build another data dashboard.** OurGilroy covers the whole city and is more thorough than
   anything OGNA should maintain. The OGNA site links to it.
2. **OGNA's gap is people, not data.** OurGilroy shows what the City is doing. It has no way to find your
   neighbors, see who is organized, or join in. The public site should answer three questions:
   *Which neighborhood am I in? Who's organizing it? How do I take part?*
3. **The useful overlap is an Oldtown filter.** Service requests, development projects and council items all
   have addresses, and OGNA has the district boundary. OGNA could ask OurGilroy for an Oldtown view (or a
   feed) and offer the boundary GeoJSON in return. Scraping their pages would be fragile and rude, so don't.
   Until they agree, link to their dashboards.
4. **Copy their stance.** Put "independent, not affiliated with the City of Gilroy" in the footer. Decide
   early whether OGNA endorses anything (see open questions).
5. **Leave crime data out.** A crime layer on a neighborhood-organizing site tends to turn meetings into
   suspicion of neighbors. Link to OurGilroy for anyone who wants it.

## 2. Domain and hosting

`CNAME` now says `oldtowngilroy.org`, so the **organizer map** serves at the root of that domain. That's the
wrong way round: the map is a working tool that loads 10 MB of parcels and imports the tax roll locally. It
shouldn't be the first thing a resident sees.

Proposed layout (one repo, one GitHub Pages site, still static):

```
oldtowngilroy.org/                 public site (new)
oldtowngilroy.org/neighborhoods/   public map of neighborhood outlines
oldtowngilroy.org/start/           starter kit
oldtowngilroy.org/organize/        today's organizer map, moved here
```

Moving the map is a `git mv` into `organize/` plus fixing the relative `data/` paths. Add
`<meta name="robots" content="noindex">` to it. The map is public anyway, but it doesn't need to be the
first search result.

## 3. Pages (first version)

| Page | Content | Source |
|---|---|---|
| **Home** | One-sentence mission, *"Know your neighbors. Organize your neighborhood. Connect it to Oldtown."*, an address box ("find my neighborhood"), next meeting, sign-up | Hand-written, `events.json` |
| **Neighborhoods** | Map of the district and neighborhood outlines, colored by status (idea / forming / active / dormant). Click one to see its name, status, meeting time and a "contact this group" button. Uncovered areas are labeled "No group yet — start one" | Public export from the organizer map |
| **Start a neighborhood** | The starter kit from `OGNA_CONTEXT.md` as a checklist, a printable door-knock flyer, and the per-neighborhood sheet the organizer map already makes | Hand-written plus existing export |
| **How OGNA works** | Street → district → city; delegates; "organize at the smallest level that makes sense; cooperate at the largest level necessary"; how OGNA reports disagreement | `OGNA_CONTEXT.md` |
| **Oldtown issues** | Short list of district-scale issues. For each one: status, and where each participating neighborhood stands, including when they disagree | Hand-written `issues.json` |
| **Calendar** | OGNA and neighborhood meetings, cleanups, socials | `events.json` or a shared Google Calendar |
| **Links** | OurGilroy dashboards, GilroyConnect, City Council agendas, the City's council-district map, GDBA, GDRA | Hand-written |

Later: council-district overlay, Oldtown filter of OurGilroy data, amenities and stores (coordinate with
GDRA's directory rather than duplicating it), Spanish translation.

**Spanish should come early, not late.** A large share of Oldtown households speak Spanish at home, so the
home page, starter kit and flyer should be bilingual by launch. The planned ACS language layer can show
where that matters most.

## 4. Data flow and privacy

```
organizer map (in someone's browser)
   └─ Export public → neighborhoods_public.json   (no coordinators, no contacts)
        └─ new: build step dissolves each neighborhood's lots into an outline
             └─ public/neighborhoods.geojson → committed → Neighborhoods page
```

- Today's public export lists member **APNs**. The public page needs **outlines**. Add a small script
  (`scripts/build_public.mjs`, turf `union` over the parcel polygons) that writes one simplified polygon per
  neighborhood. The public page then doesn't load `parcels.json`.
- **No names, emails or phone numbers of residents on the public site.** "Contact this group" goes through
  a form service that forwards to the coordinator, so their address stays private.
- **No lot-level data on the public site**: no tax, no year built, no per-lot population. Neighborhood
  totals (estimated residents, homes) are fine and help show coverage.
- Coverage ("X% of Oldtown residents live in an organized neighborhood") is a good number to show on the
  home page. The organizer map already calculates it.

## 5. Technology

Same stack as the map, so one person can maintain both: static HTML/CSS/JS, Leaflet, GitHub Pages, no build
server. The site has four parts that need a server, and a hosted service covers each one:

| Need | Recommendation | Why |
|---|---|---|
| Sign-up / mailing list | Buttondown or Mailchimp free tier | Double opt-in, easy unsubscribe, exports cleanly |
| "Contact this group" and "start a group" forms | Tally or Formspree | Forwards by email, hides the recipient |
| Calendar | A public Google Calendar, embedded, with an `.ics` link | Coordinators can add events without touching the repo |
| Address lookup | Census geocoder (free, no key) → point-in-polygon against the outlines | Already used by the data build |

## 6. Phases

1. **Now (before the Nov 3 election):** move the map to `/organize/`. Publish Home, How OGNA works, Start a
   neighborhood and Links, plus a sign-up form. That gives flyers and door-knocking a URL to point to.
2. **Once 2–3 neighborhoods exist:** Neighborhoods map with outlines, contact forms, calendar, coverage
   number.
3. **Once there's a council of delegates:** Oldtown issues page with neighborhood positions. Contact
   OurGilroy about an Oldtown filter.
4. **Later:** council-district overlay, transit layer, amenities, full Spanish site.

## 7. Open questions for the organizer

1. **Domain:** is `oldtowngilroy.org` registered and pointed at GitHub Pages yet? Should the organizer map
   stay on the domain at `/organize/`, or only at the `github.io` address?
2. **Endorsements:** will OGNA ever take positions on candidates or ballot measures, or only on policy
   issues? OurGilroy stays strictly neutral. A candidate forum for District 4/5/6 is possible either way,
   but the decision should be public.
3. **Which council districts cover Oldtown?** Check the City's district map. If the district spans more
   than one, the site should say which councilmember each neighborhood has.
4. **Who can edit neighborhood entries:** only the OGNA admin (through the organizer map), or coordinators
   themselves? The first is simpler and fine for a dozen groups.
5. **Language:** is a Spanish-speaking volunteer available to review translations?
6. **Name and logo:** "Oldtown" or "Old Town"? Settle it before printing flyers.
