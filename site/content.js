// Content rules shared by the public site and (later) the Google Sheet import: which rows go public and which
// language a field shows in. No DOM.

/** Rows go public only when approved. Resources have no approved column in the Sheet, so they pass unless false. */
export function approved(rows, { optional = false } = {}) {
  return (Array.isArray(rows) ? rows : []).filter((r) => r && (optional ? r.approved !== false : isTrue(r.approved)));
}
const isTrue = (v) => v === true || /^(true|yes|y|x|1|✓|✔)$/i.test(String(v ?? "").trim());

/**
 * A field in the chosen language: `field_es` for Spanish, falling back to `field_en` (or `field`).
 * Returns { text, fallback } where fallback is true when Spanish was asked for but English was shown.
 */
export function localized(row, field, lang) {
  const en = row?.[`${field}_en`] ?? row?.[field] ?? "";
  if (lang !== "es") return { text: String(en || ""), fallback: false };
  const es = row?.[`${field}_es`];
  return es ? { text: String(es), fallback: false } : { text: String(en || ""), fallback: Boolean(en) };
}

/** Events on or after `today` (YYYY-MM-DD), soonest first. */
export function upcoming(events, today) {
  return approved(events).filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date) && e.date >= today)
    .sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));
}

/** Only http(s) links reach the page. */
export function safeUrl(u) {
  const s = String(u || "").trim();
  return /^https?:\/\//i.test(s) ? s : "";
}

/** Local date as YYYY-MM-DD. */
export function todayIso(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
