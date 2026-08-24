import { addDays, endOfYear } from "./dates";

// ── goal taxonomy ──
export const CATEGORIES = ["Health", "Career", "Learning", "Finance", "Personal", "Deen", "Other"];
// Category accents — retuned to harmonise with the Sand & Jade palette
// (warmer, slightly muted; Health echoes the jade primary, Deen the warm
// gold secondary). Single mid-tone hexes chosen to read on both the
// green-black dark base and the sand light base. Consumed both directly and
// via hex+alpha concatenation (e.g. `catColor + "22"`), so these stay hex.
export const CAT_COLORS = {
  Health: "#3faa7e",   // jade-green
  Career: "#8378d0",   // soft violet
  Learning: "#4f95c9", // sky
  Finance: "#c79338",  // ochre gold
  Personal: "#d4744a", // terracotta
  Deen: "#d9b85e",     // warm gold
  Other: "#9a9078",    // warm taupe
};
export const PRIORITIES = ["Low", "Medium", "High"];

// ── prayer ──
export const PRAYERS = ["Fajr", "Sunrise", "Dhuhr", "Asr", "Maghrib", "Isha"];
// Voluntary (nafl) prayers tracked separately — they're not obligatory, so
// they're excluded from qaza, "prayers today" counts, and Prayer Health.
// Kept in prayerLog under the same shape so the streak/cell helpers reuse.
export const VOLUNTARY_PRAYERS = ["Tahajjud"];
export const PRAYER_ICONS = { Fajr: "🌙", Sunrise: "🌅", Dhuhr: "☀️", Asr: "🌤️", Maghrib: "🌇", Isha: "✨", Tahajjud: "🌃" };
// Colours mirror the time of day each prayer falls in: deep indigo dawn,
// rising amber, gold midday, warm afternoon, sunset red, indigo night.
// Tahajjud sits in the deepest part of night. Brightened from the original
// charcoal-era hues so the cool indigo/violet prayers (Fajr, Isha, Tahajjud)
// stay legible on the Midnight Noor indigo base instead of sinking into it.
export const PRAYER_COLORS = {
  Fajr:    "#6b74c4",  // muted periwinkle dawn
  Sunrise: "#dd9a4e",  // warm amber
  Dhuhr:   "#d9b85e",  // midday gold (matches the secondary accent)
  Asr:     "#d38a4c",  // warm afternoon
  Maghrib: "#cf6b47",  // terracotta sunset
  Isha:    "#8a79c0",  // muted violet night
  Tahajjud: "#5f5ba6", // deep indigo
};

// ── spiritual content ──
export const QUOTES = [
  { ar: "وَمَا الْحَيَاةُ الدُّنْيَا إِلَّا مَتَاعُ الْغُرُورِ", en: "The life of this world is nothing but the enjoyment of delusion.", ref: "Quran 3:185" },
  { ar: "فَإِنَّ مَعَ الْعُسْرِ يُسْرًا", en: "Verily, with every hardship comes ease.", ref: "Quran 94:5" },
  { ar: "وَاسْتَعِينُوا بِالصَّبْرِ وَالصَّلَاةِ", en: "Seek help through patience and prayer.", ref: "Quran 2:45" },
  { ar: "إِنَّ اللَّهَ مَعَ الصَّابِرِينَ", en: "Indeed, Allah is with the patient.", ref: "Quran 2:153" },
  { ar: "وَمَن يَتَّقِ اللَّهَ يَجْعَل لَّهُ مَخْرَجًا", en: "Whoever fears Allah, He will make a way out for him.", ref: "Quran 65:2" },
  { en: "The best of deeds are those done regularly, even if they are few.", ref: "Hadith – Bukhari & Muslim" },
  { en: "Make use of five before five: your youth before old age, your health before illness, your wealth before poverty, your free time before preoccupation, and your life before death.", ref: "Hadith – Ibn Abbas" },
  { en: "Every soul shall taste death. Only on the Day of Resurrection shall you be paid your full recompense.", ref: "Quran 3:185" },
];

export const INTENTIONS = [
  "I am doing this to please Allah and earn Jannah.",
  "This effort is my sadaqah jariyah.",
  "Ya Allah, accept this from me as an act of worship.",
  "Every step closer to my goal is a step closer to Jannah.",
  "My time is an amanah — I will use it wisely.",
];

export const FALLBACK_VERSE = {
  verseKey: "94:5",
  arabic: "فَإِنَّ مَعَ الْعُسْرِ يُسْرًا",
  translation: "So surely with hardship comes ease.",
  url: "https://quran.com/94:5",
};

// ── goal-form due-date presets ──
export const DUE_PRESETS = [
  { label: "1 week", get: () => addDays(7) },
  { label: "1 month", get: () => addDays(30) },
  { label: "3 months", get: () => addDays(90) },
  { label: "End of year", get: endOfYear },
];

// ── muhasaba ──
export const SIN_TAGS = ["Backbiting", "Anger", "Lying", "Wasted time", "Heedlessness", "Other"];
export const NIYYAH_LABELS = {
  1: "Mostly heedless",
  2: "Distracted",
  3: "Mixed",
  4: "Mostly for Allah",
  5: "Sincere & focused",
};

// ── pomodoro ──
export const DEFAULT_DURATIONS = { defaultFocus: 60, break: 10 };
