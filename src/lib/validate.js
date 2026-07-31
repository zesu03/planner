// Defensive read coercion (Phase R2 — data integrity). A corrupt or
// wrong-typed top-level field — from an old client version, a bad write, or
// manual tampering — must never crash the app. Coerce each field to its
// expected container type on read so downstream `.filter` / `.map` /
// `Object.keys` can't throw on it.
//
// This is the light, zero-dependency layer of runtime validation. Deeper
// per-shape validation (e.g. zod at the read/write boundary) is a separate,
// heavier step tracked in IMPROVEMENTS.md (R5).

// Array or nothing. Non-arrays (objects, primitives, null) become [].
export const asArray = (v) => (Array.isArray(v) ? v : []);

// Plain object or nothing. Arrays, primitives, and null become {} — arrays are
// explicitly rejected so a field expected to be a map can't be iterated as one.
export const asObject = (v) =>
  v && typeof v === "object" && !Array.isArray(v) ? v : {};
