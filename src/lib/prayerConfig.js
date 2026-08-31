// Prayer-time calculation config — the Aladhan "method" (Fajr/Isha angle
// convention) and "school" (Asr shadow length / madhab). Both the client
// (usePrayer) and the server cron (api/_prayer) need to build the same
// `method=<m>&school=<s>` query string; this is the single source of truth for
// the client. The server keeps its own tiny copy (api/ stays self-contained,
// as it already did for the old METHOD_SCHOOL const) — the two are kept in
// lockstep by tests.

// Preserve today's behaviour when a user hasn't chosen: ISNA + Hanafi Asr.
export const DEFAULT_METHOD = 2; // Islamic Society of North America
export const DEFAULT_SCHOOL = 1; // Hanafi (later Asr)

// Curated set of the Aladhan calculation methods people actually use, most
// common first. Full list: https://aladhan.com/calculation-methods
export const CALC_METHODS = [
  { id: 3,  name: "Muslim World League" },
  { id: 2,  name: "Islamic Society of North America (ISNA)" },
  { id: 5,  name: "Egyptian General Authority of Survey" },
  { id: 4,  name: "Umm al-Qura, Makkah" },
  { id: 1,  name: "University of Islamic Sciences, Karachi" },
  { id: 8,  name: "Gulf Region" },
  { id: 9,  name: "Kuwait" },
  { id: 10, name: "Qatar" },
  { id: 11, name: "Singapore (MUIS)" },
  { id: 17, name: "Malaysia (JAKIM)" },
  { id: 20, name: "Indonesia (Kemenag)" },
  { id: 13, name: "Turkey (Diyanet)" },
  { id: 12, name: "France (UOIF)" },
  { id: 15, name: "Moonsighting Committee Worldwide" },
  { id: 0,  name: "Shia Ithna-Ashari" },
];

// Asr madhab — the shadow-length rule. 0 = the majority "standard" (shadow =
// object length), 1 = Hanafi (shadow = twice object length, so a later Asr).
export const ASR_SCHOOLS = [
  { id: 0, label: "Standard (Shāfiʿī, Mālikī, Ḥanbalī)" },
  { id: 1, label: "Ḥanafī" },
];

const METHOD_IDS = new Set(CALC_METHODS.map((m) => m.id));

// Validate a stored method id — fall back to the default if it's missing or not
// one we offer, so a corrupt/old value can never send a broken query. Guard
// null/"" first: Number(null) === 0, and 0 is itself a valid method id, so a
// bare coercion would silently turn "unset" into the Shia method.
export function normalizeMethod(method) {
  if (method == null || method === "") return DEFAULT_METHOD;
  const n = Number(method);
  return Number.isInteger(n) && METHOD_IDS.has(n) ? n : DEFAULT_METHOD;
}

// Asr school is strictly 0 or 1; anything else falls back to the default.
// Same null/"" guard as normalizeMethod (Number(null) === 0 would read as
// "Standard" rather than "unset").
export function normalizeSchool(school) {
  if (school == null || school === "") return DEFAULT_SCHOOL;
  const n = Number(school);
  return n === 0 || n === 1 ? n : DEFAULT_SCHOOL;
}

// Build the Aladhan query fragment from a (possibly untrusted) method/school.
export function methodSchoolParam(method, school) {
  return `method=${normalizeMethod(method)}&school=${normalizeSchool(school)}`;
}

// Display name for a method id (for the current-selection label).
export function methodName(method) {
  const m = CALC_METHODS.find((x) => x.id === normalizeMethod(method));
  return m ? m.name : "";
}
