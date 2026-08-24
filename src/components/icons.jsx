// Crafted icon set — replaces emoji UI icons with lucide-react SVGs for
// cross-platform consistency and a more refined tone. Prayer-time icons map to
// the sun's position through the day; the Prayer TAB uses a small custom mosque
// (lucide has no mosque glyph), stroked to match lucide's line weight.
//
// Server push notifications keep emoji (system tray, no React) — that's fine.

import {
  Sunrise, SunDim, Sun, CloudSun, Sunset, Moon, MoonStar,
  LayoutDashboard, Target, Timer, BarChart3,
  Flame, Repeat, Search, MapPin, Bell, Trophy, Sprout, Pencil,
  Maximize2, Feather, NotebookPen, Sparkles, HandHeart, Mail, AlertTriangle,
  TrendingUp, BookMarked, CheckCircle2, Clock, Plus, CalendarDays,
} from "lucide-react";

// Prayer name → time-of-day icon.
const PRAYER_ICON = {
  Fajr: Sunrise,     // dawn
  Sunrise: SunDim,   // faint early sun
  Dhuhr: Sun,        // midday peak
  Asr: CloudSun,     // afternoon
  Maghrib: Sunset,   // dusk
  Isha: Moon,        // night
  Tahajjud: MoonStar,// deep night
};

export function PrayerIcon({ name, size = 18, strokeWidth = 1.75, style }) {
  const I = PRAYER_ICON[name] || Sun;
  return <I size={size} strokeWidth={strokeWidth} style={style} aria-hidden="true" />;
}

// Small custom mosque (dome + walls + arched door + finial), stroked to sit
// alongside lucide's line icons in the tab bar.
function Mosque({ size = 20, strokeWidth = 1.9, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round"
      strokeLinejoin="round" style={style} aria-hidden="true">
      <path d="M12 1.6c.9.8.9 1.8 0 2.6-.9-.8-.9-1.8 0-2.6z" />
      <path d="M5 11a7 7 0 0 1 14 0" />
      <path d="M5 11v9" />
      <path d="M19 11v9" />
      <path d="M3 20h18" />
      <path d="M10 20v-3a2 2 0 0 1 4 0v3" />
    </svg>
  );
}

// Tab key → icon.
const TAB_ICON = {
  dashboard: LayoutDashboard,
  list: Target,
  prayer: Mosque,
  pomodoro: Timer,
  muhasaba: Moon,
  stats: BarChart3,
};

export function TabIcon({ name, size = 20, strokeWidth = 1.9, style }) {
  const I = TAB_ICON[name] || LayoutDashboard;
  return <I size={size} strokeWidth={strokeWidth} style={style} aria-hidden="true" />;
}

// Reusable mosque (login/error screens, prayer section headers).
export function MosqueIcon(props) {
  return <Mosque {...props} />;
}

// Brand mark — an 8-point star (rub el hizb): two overlapped rounded squares
// with a centre point. Stroked with currentColor so callers tint it via the
// CSS `color` property (accent in dark/light). Used on the login screen and
// the desktop sidebar in place of the old 🕌 emoji.
export function BrandMark({ size = 32, strokeWidth = 1.8, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" style={style} aria-hidden="true">
      <g stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round">
        <rect x="6.5" y="6.5" width="19" height="19" rx="3.5" />
        <rect x="6.5" y="6.5" width="19" height="19" rx="3.5" transform="rotate(45 16 16)" />
      </g>
      <circle cx="16" cy="16" r="3" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Generic app icon by semantic name — the single place UI glyphs are mapped,
// so sizing/stroke stay consistent. Add here rather than reaching for an emoji.
// (Some names reuse a close lucide glyph where no exact match exists — e.g.
// dhikr/mirror → Sparkles, dua → HandHeart.)
const ICON = {
  mosque: Mosque,
  flame: Flame,          // streaks / istiqāmah
  target: Target,        // goals
  repeat: Repeat,        // recurring habit / qaza ledger
  search: Search,
  location: MapPin,
  bell: Bell,            // notifications
  trophy: Trophy,        // top focus
  sprout: Sprout,        // first task / getting started
  pencil: Pencil,        // edit
  maximize: Maximize2,   // fullscreen
  feather: Feather,      // niyyah / intention
  note: NotebookPen,     // recent sessions / notes
  sparkles: Sparkles,    // AI mirror / niyyah spark
  mirror: Sparkles,      // AI reflection
  dhikr: Sparkles,       // remembrance (no exact lucide glyph)
  dua: HandHeart,        // supplication
  mail: Mail,            // yesterday's du'a note
  moon: Moon,
  sun: Sun,              // light-theme toggle
  night: MoonStar,       // voluntary / night practice
  warning: AlertTriangle,
  trend: TrendingUp,     // niyyah trend
  verse: BookMarked,     // saved ayat
  check: CheckCircle2,   // cleared / all-caught-up states
  clock: Clock,          // projection / time-to-clear
  plus: Plus,            // add action
  calendar: CalendarDays,// excused days
};

export function Icon({ name, size = 16, strokeWidth = 1.9, style, className }) {
  const I = ICON[name] || Sparkles;
  return <I size={size} strokeWidth={strokeWidth} style={style} className={className} aria-hidden="true" />;
}
