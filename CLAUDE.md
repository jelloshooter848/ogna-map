# OGNA map

Read [`docs/SESSION_HANDOFF.md`](docs/SESSION_HANDOFF.md) before anything else. It records what has been built,
the data sources, hosting, and the organizer's decisions for the public site. Items marked ✅ there are decided:
build on them and don't re-plan them. If something in the repo seems to contradict it, ask the user.

- Work and push only on `claude/ogna-density-map-fp8a4s`. It is the default branch and the GitHub Pages source
  for oldtowngilroy.org. Don't delete `CNAME`.
- Data files are built by the *Build data* GitHub Action (`scripts/build_gilroy.mjs`), not in the session.
- The repo is public: never commit tax or assessor files, owner names, or contacts.
- Tests: `npm test`; `node scripts/make_fixture.mjs && node test/browser.mjs`; `node test/real_smoke.mjs`.
- When an important decision is made, record it in `docs/SESSION_HANDOFF.md` so the next session has it.
