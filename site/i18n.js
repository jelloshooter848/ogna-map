// Interface text in English and Spanish. The Spanish is a first draft awaiting review by a Spanish-speaking
// volunteer (see docs/SESSION_HANDOFF.md). Content text (descriptions, events) comes from content/*.json.

const TEXT = {
  en: {
    org: "Oldtown Gilroy Neighborhood Alliance",
    org_short: "Oldtown Gilroy",
    tagline: "Know your neighbors. Organize your neighborhood. Connect it to Oldtown.",
    lang_other: "Español",
    find_title: "Which neighborhood am I in?",
    find_help: "Type your street address, or tap the map.",
    address_label: "Street address",
    address_placeholder: "e.g. 7351 Rosanna St",
    find: "Find",
    locate: "Use my location",
    locating: "Finding your location…",
    locate_failed: "Couldn't get your location. Type your address instead.",
    not_found: "We couldn't find that address in or near Oldtown. Check the number and street, or tap the map.",
    need_number: "Please include the house number, e.g. 7351 Rosanna St.",
    near_label: "Nearest address on file: {label}.",
    in_hoods: "You're in:",
    in_hood_one: "You're in {name}.",
    no_group: "You're in Oldtown, but there's no neighborhood group here yet.",
    no_group_cta: "Start one with your neighbors: it can be as small as your block.",
    outside: "That's outside Oldtown. OGNA covers downtown Gilroy between US 101, Miller Ave, Leavesley Rd and 10th St.",
    start_group: "Start a group",
    starter_kit: "Starter kit",
    loading: "Loading…",
    map_updating: "The map is being updated. Please check back in a few minutes.",
    map_title: "Neighborhoods",
    layer_parks: "Parks",
    layer_schools: "Schools",
    layer_library: "Library",
    layer_transit: "Transit",
    layer_events: "Events",
    layer_places: "Places",
    legend_district: "Oldtown",
    legend_open: "No group yet",
    hoods_title: "Neighborhood groups",
    hoods_none: "No neighborhood groups have formed yet. Yours could be the first.",
    meets: "Meets: {when}",
    view: "View",
    events_title: "Upcoming events",
    events_none: "No upcoming events yet.",
    projects_title: "City projects in Oldtown",
    projects_nearby: "City projects nearby",
    projects_all: "All City capital projects (OurGilroy)",
    city_title: "City services",
    numbers_title: "Gilroy by the numbers",
    numbers_intro: "Dashboards from OurGilroy, an independent community site built from public data.",
    english_only: "",
    vote_title: "Your City Council district",
    vote_intro: "Gilroy now elects its City Council by district. Find yours and learn about the election:",
    community_title: "Local shops",
    about_title: "About OGNA",
    about_body: "The Oldtown Gilroy Neighborhood Alliance is a federation of small, block-scale neighborhood groups in and around downtown Gilroy. Neighborhoods can overlap. Organize at the smallest level that makes sense; cooperate at the largest level necessary.",
    suggest: "Suggest an event or place",
    back: "← All neighborhoods",
    join: "Join this neighborhood",
    report: "Report an issue to the City",
    print: "Print",
    share: "Share",
    copied: "Link copied.",
    hood_events: "Events in this neighborhood",
    hood_not_found: "We couldn't find that neighborhood.",
    translation_needed: "Translation needed",
    osm_credit: "Map data © OpenStreetMap contributors.",
    foot: "Neighborhood boundaries are drawn by OGNA organizers.",
    organizers: "For organizers",
    in_oldtown_popup: "No neighborhood group here yet.",
  },
  es: {
    org: "Alianza de Vecindarios de Oldtown Gilroy",
    org_short: "Oldtown Gilroy",
    tagline: "Conozca a sus vecinos. Organice su vecindario. Conéctelo con Oldtown.",
    lang_other: "English",
    find_title: "¿En qué vecindario estoy?",
    find_help: "Escriba su dirección o toque el mapa.",
    address_label: "Dirección",
    address_placeholder: "p. ej. 7351 Rosanna St",
    find: "Buscar",
    locate: "Usar mi ubicación",
    locating: "Buscando su ubicación…",
    locate_failed: "No pudimos obtener su ubicación. Escriba su dirección.",
    not_found: "No encontramos esa dirección en Oldtown ni cerca. Revise el número y la calle, o toque el mapa.",
    need_number: "Incluya el número de la casa, p. ej. 7351 Rosanna St.",
    near_label: "Dirección más cercana registrada: {label}.",
    in_hoods: "Usted está en:",
    in_hood_one: "Usted está en {name}.",
    no_group: "Usted está en Oldtown, pero aquí todavía no hay un grupo de vecinos.",
    no_group_cta: "Empiece uno con sus vecinos: puede ser tan pequeño como su cuadra.",
    outside: "Eso está fuera de Oldtown. OGNA cubre el centro de Gilroy entre la US 101, Miller Ave, Leavesley Rd y 10th St.",
    start_group: "Empezar un grupo",
    starter_kit: "Guía para empezar",
    loading: "Cargando…",
    map_updating: "El mapa se está actualizando. Vuelva en unos minutos.",
    map_title: "Vecindarios",
    layer_parks: "Parques",
    layer_schools: "Escuelas",
    layer_library: "Biblioteca",
    layer_transit: "Transporte",
    layer_events: "Eventos",
    layer_places: "Lugares",
    legend_district: "Oldtown",
    legend_open: "Aún sin grupo",
    hoods_title: "Grupos de vecinos",
    hoods_none: "Todavía no se ha formado ningún grupo de vecinos. El suyo podría ser el primero.",
    meets: "Se reúne: {when}",
    view: "Ver",
    events_title: "Próximos eventos",
    events_none: "Todavía no hay eventos próximos.",
    projects_title: "Obras de la Ciudad en Oldtown",
    projects_nearby: "Obras de la Ciudad cercanas",
    projects_all: "Todas las obras públicas de la Ciudad (OurGilroy)",
    city_title: "Servicios de la Ciudad",
    numbers_title: "Gilroy en cifras",
    numbers_intro: "Paneles de OurGilroy, un sitio comunitario independiente basado en datos públicos.",
    english_only: "(en inglés)",
    vote_title: "Su distrito del Concejo Municipal",
    vote_intro: "Gilroy ahora elige su Concejo Municipal por distritos. Encuentre el suyo e infórmese sobre la elección:",
    community_title: "Tiendas locales",
    about_title: "Sobre OGNA",
    about_body: "La Alianza de Vecindarios de Oldtown Gilroy es una federación de pequeños grupos de vecinos, a escala de cuadra, en el centro de Gilroy y sus alrededores. Los vecindarios pueden superponerse. Organizarse al nivel más pequeño que tenga sentido; cooperar al nivel más grande que sea necesario.",
    suggest: "Sugerir un evento o lugar",
    back: "← Todos los vecindarios",
    join: "Unirse a este vecindario",
    report: "Reportar un problema a la Ciudad",
    print: "Imprimir",
    share: "Compartir",
    copied: "Enlace copiado.",
    hood_events: "Eventos en este vecindario",
    hood_not_found: "No encontramos ese vecindario.",
    translation_needed: "Falta traducción",
    osm_credit: "Datos del mapa © colaboradores de OpenStreetMap.",
    foot: "Los límites de los vecindarios los trazan los organizadores de OGNA.",
    organizers: "Para organizadores",
    in_oldtown_popup: "Aquí todavía no hay un grupo de vecinos.",
  },
};

const STORE = "ogna_lang";

/** Language: ?lang= first, then the last choice, then the browser's language. */
export function pickLang() {
  const q = new URLSearchParams(location.search).get("lang");
  if (q === "en" || q === "es") return q;
  try { const s = localStorage.getItem(STORE); if (s === "en" || s === "es") return s; } catch {}
  return /^es\b/i.test(navigator.language || "") ? "es" : "en";
}
export function rememberLang(lang) { try { localStorage.setItem(STORE, lang); } catch {} }

export function translator(lang) {
  const dict = TEXT[lang] || TEXT.en;
  return (key, vars = {}) => String(dict[key] ?? TEXT.en[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

/** Dates like "Sat, Oct 3" / "sáb, 3 oct". */
export function fmtDate(iso, lang) {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString(lang === "es" ? "es-US" : "en-US", { weekday: "short", month: "short", day: "numeric" });
}

export const LANGS = Object.keys(TEXT);
export { TEXT };
