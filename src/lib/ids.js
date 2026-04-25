// Stable id generator. Uses crypto.randomUUID when available, falls back
// to a timestamped random string for older browsers / environments.
export const newId = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};
