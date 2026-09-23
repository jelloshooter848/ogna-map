// Local tax-roll import. The file is read in the browser and only the mapped columns (APN and dollar
// amounts) are kept, in this browser's IndexedDB. Nothing is uploaded and nothing enters region-set
// exports; owner names and every other column are discarded as soon as the file is parsed.
import { normaliseApn } from "./units.js";

export const FIELDS = [
  { key: "apn", label: "APN (parcel number)", required: true, guess: [/^apn$/i, /apn/i, /parcel/i] },
  { key: "tax", label: "Total tax billed", guess: [/total.*tax|tax.*(total|amount|billed|due)/i, /^tax$/i, /ad.?valorem/i] },
  { key: "land", label: "Land value", guess: [/land.*val|^land$/i] },
  { key: "impr", label: "Improvement value", guess: [/impr/i, /structure|building.*val/i] },
  { key: "exempt", label: "Exemptions", guess: [/exempt/i] },
  { key: "net", label: "Net assessed value", guess: [/net.*(val|assess)|assessed.*val|taxable/i] },
];
const SENSITIVE = /owner|name|mail|taxpayer|care.?of|address|addr/i;

/** RFC 4180-ish CSV parser (quotes, doubled quotes, CRLF). Also accepts tab-separated text. */
export function parseCsv(text) {
  const delim = (text.split(/\r?\n/, 1)[0].match(/\t/g) || []).length > (text.split(/\r?\n/, 1)[0].match(/,/g) || []).length ? "\t" : ",";
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v !== "")) rows.push(row);
  const [header = [], ...data] = rows;
  return { header: header.map((h) => h.trim()), rows: data };
}

/** Best-guess column index per field (-1 = none). Sensitive-looking columns are never guessed. */
export function guessMapping(header) {
  const used = new Set();
  const mapping = {};
  for (const f of FIELDS) {
    let idx = -1;
    for (const re of f.guess) {
      idx = header.findIndex((h, i) => !used.has(i) && re.test(h) && !(f.key !== "apn" && SENSITIVE.test(h)));
      if (idx >= 0) break;
    }
    mapping[f.key] = idx;
    if (idx >= 0) used.add(idx);
  }
  return mapping;
}

const money = (v) => {
  if (v === undefined || v === null) return undefined;
  const s = String(v).replace(/[$,\s]/g, "");
  if (s === "") return undefined;
  const neg = /^\(.*\)$/.test(s);
  const n = Number(s.replace(/[()]/g, ""));
  return Number.isFinite(n) ? (neg ? -n : n) : undefined;
};

/**
 * Build the in-memory roll from parsed rows and a mapping. Returns { roll: Map, meta } where rows with
 * the same APN are summed (installments or supplemental bills on separate lines).
 */
export function buildRoll({ header, rows }, mapping, name) {
  if (!(mapping.apn >= 0)) throw new Error("Choose the APN column.");
  if (![mapping.tax, mapping.land, mapping.impr, mapping.net].some((i) => i >= 0)) throw new Error("Choose at least a tax amount or an assessed value column.");
  const roll = new Map();
  for (const r of rows) {
    const apn = normaliseApn(r[mapping.apn]);
    if (!apn) continue;
    const cur = roll.get(apn) || {};
    for (const f of FIELDS) {
      if (f.key === "apn" || !(mapping[f.key] >= 0)) continue;
      const v = money(r[mapping[f.key]]);
      if (v !== undefined) cur[f.key] = (cur[f.key] || 0) + v;
    }
    roll.set(apn, cur);
  }
  const usedCols = Object.values(mapping).filter((i) => i >= 0);
  const meta = {
    name, rows: rows.length, parcels: roll.size, loaded_at: new Date().toISOString(),
    columns: Object.fromEntries(FIELDS.filter((f) => mapping[f.key] >= 0).map((f) => [f.key, header[mapping[f.key]]])),
    discarded_columns: header.filter((_, i) => !usedCols.includes(i)).length,
  };
  return { roll, meta };
}

// ---- IndexedDB persistence ---------------------------------------------------------------------------

const DB = "ogna_map", STORE = "private", KEY = "taxroll";
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function tx(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(req?.result); };
    t.onerror = () => { db.close(); reject(t.error); };
  });
}
export async function saveRoll(roll, meta) {
  await tx("readwrite", (s) => s.put({ meta, rows: [...roll.entries()] }, KEY));
}
export async function loadRoll() {
  try {
    const v = await tx("readonly", (s) => s.get(KEY));
    return v ? { roll: new Map(v.rows), meta: v.meta } : null;
  } catch (e) { console.warn("tax roll storage unavailable", e); return null; }
}
export async function deleteRoll() { try { await tx("readwrite", (s) => s.delete(KEY)); } catch { /* ignore */ } }
