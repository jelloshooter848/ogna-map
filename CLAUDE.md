# OGNA map

Read [`docs/SESSION_HANDOFF.md`](docs/SESSION_HANDOFF.md) before anything else. It records what has been built,
the data sources, hosting, and the organizer's decisions for the public site. Items marked ✅ there are decided:
build on them and don't re-plan them. If something in the repo seems to contradict it, ask the user.

- Work and push only on `claude/ogna-density-map-fp8a4s`. It is the default branch and the GitHub Pages source
  for oldtowngilroy.org. Don't delete `CNAME`.
- Data files are built by the *Build data* and *Build public data* GitHub Actions (`scripts/build_gilroy.mjs`,
  `scripts/build_public.mjs`), not in the session.
- The repo is public: never commit tax or assessor files, owner names, or contacts.
- Tests: `npm test`; `node scripts/make_fixture.mjs && node test/browser.mjs`;
  `node scripts/build_public.mjs --data test/fixture/ --no-osm && node test/public_browser.mjs`; `node test/real_smoke.mjs`.
- The public site (root, `site/`) must never show demographic or per-lot data; `test/public_browser.mjs` checks this.
- When an important decision is made, record it in `docs/SESSION_HANDOFF.md` so the next session has it.
