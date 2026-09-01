import { useEffect, useState } from "react";
import { PRAYERS, PRAYER_COLORS, VOLUNTARY_PRAYERS } from "../lib/constants";
import { PrayerIcon, Icon } from "../components/icons";
import { localDateStr } from "../lib/dates";
import { currentPrayerWindow, prayerDisplayName } from "../lib/prayer";
import { CALC_METHODS, ASR_SCHOOLS } from "../lib/prayerConfig";
import { rewardPrayerMark } from "../lib/feedback";
import { toMinutes } from "../lib/jamaah";
import {
  currentPermission,
  isIosNeedsInstall,
  isNotificationsSupported,
  requestPermissionAndToken,
} from "../lib/notifications";
import { S } from "../lib/styles";

// Arabic name + time-of-day descriptor per prayer, for the row subtitles.
const PRAYER_META = {
  Fajr: { ar: "فجر", phase: "Dawn" },
  Sunrise: { ar: "شروق", phase: "Sunrise" },
  Dhuhr: { ar: "ظهر", phase: "Midday" },
  Asr: { ar: "عصر", phase: "Afternoon" },
  Maghrib: { ar: "مغرب", phase: "Sunset" },
  Isha: { ar: "عشاء", phase: "Night" },
  Tahajjud: { ar: "تهجد", phase: "Last third of the night" },
};

// Prayer tab — the daily worship screen. A serene single column: a calm
// next-prayer hero, the five fard prayers as aligned rows, then Tahajjud,
// the 7-day tracker (retro-logging) and reminders. Qaza make-up management
// lives in the Mizan tab now, so this stays focused on today.
export default function Prayer({
  prayerTimes,
  prayerLog,
  prayerLoading,
  prayerError,
  editingCity,
  setEditingCity,
  cityInput,
  countryInput,
  nextPrayer,
  setCityInput,
  setCountryInput,
  fetchPrayers,
  fetchByGeo,
  prayerMethod,
  prayerSchool,
  setPrayerCalc,
  jamaahTimes,
  setJamaahTime,
  togglePrayerLog,
  togglePrayerLogOnDay,
  prayerDoneToday,
  canMarkPrayer,
  prayerStreak,
  notifications,
  updateNotifications,
}) {
  // The currently-active prayer window. Null between windows (e.g. between
  // Sunrise and Dhuhr), so the "now" badge doesn't cling to Fajr after its
  // window has closed.
  const currentPrayerName = currentPrayerWindow(prayerTimes);

  // "Change city" mode is lifted to Planner (so the page-header location line
  // can toggle it) and passed in as editingCity/setEditingCity. Show the city
  // form when there are no times yet, or the user chose to change location.
  const showCityForm = !prayerTimes || editingCity;

  // Reward the moment a prayer is *newly* marked (not on unmark): a soft
  // chime + haptic + a brief burst on the row. `burstKey` drives the
  // animation; it auto-clears so the row settles back.
  const [burstKey, setBurstKey] = useState(null);
  const [jamaahOpen, setJamaahOpen] = useState(false);
  function markPrayer(p) {
    const wasDone = prayerDoneToday ? prayerDoneToday(p) : false;
    togglePrayerLog(p);
    if (!wasDone) {
      rewardPrayerMark();
      setBurstKey(p);
      setTimeout(() => setBurstKey((k) => (k === p ? null : k)), 650);
    }
  }

  return (
    <div className="view-content">
      {showCityForm && (
        <div style={{ ...S.card, marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 14 }}>
            {prayerTimes ? "Change location" : "Set your location"}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 14, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>City</label>
              <input value={cityInput} onChange={(e) => setCityInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchPrayers(cityInput, countryInput)}
                placeholder="e.g. London"
                style={{ width: "100%", boxSizing: "border-box", fontSize: 15 }} />
            </div>
            <div>
              <label style={{ fontSize: 14, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Country</label>
              <input value={countryInput} onChange={(e) => setCountryInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchPrayers(cityInput, countryInput)}
                placeholder="e.g. UK"
                style={{ width: "100%", boxSizing: "border-box", fontSize: 15 }} />
            </div>
          </div>
          {/* Calculation method + Asr madhab. Method sets the Fajr/Isha angle
              convention; Asr school picks the shadow-length rule (Ḥanafī = later
              Asr). Changing either re-fetches the current location in place. */}
          {setPrayerCalc && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ fontSize: 14, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Calculation method</label>
                <select value={prayerMethod}
                  onChange={(e) => setPrayerCalc(Number(e.target.value), prayerSchool)}
                  style={{ width: "100%", boxSizing: "border-box", fontSize: 15 }}>
                  {CALC_METHODS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 14, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Asr (madhab)</label>
                <select value={prayerSchool}
                  onChange={(e) => setPrayerCalc(prayerMethod, Number(e.target.value))}
                  style={{ width: "100%", boxSizing: "border-box", fontSize: 15 }}>
                  {ASR_SCHOOLS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => fetchPrayers(cityInput, countryInput)}
              disabled={prayerLoading || !cityInput.trim() || !countryInput.trim()}
              className="btn-primary"
              style={{ flex: 1, minWidth: 140, padding: "9px 14px" }}>
              {prayerLoading ? "Loading..." : "Get prayer times"}
            </button>
            <button onClick={fetchByGeo} disabled={prayerLoading} style={{ fontSize: 15 }}>
              Use my location
            </button>
            {/* Cancel only makes sense once the user has prayer times to
                return to — otherwise there's nothing to cancel back to. */}
            {prayerTimes && (
              <button onClick={() => setEditingCity(false)} style={{ fontSize: 15 }}>
                Cancel
              </button>
            )}
          </div>
          {prayerError && (
            <div role="alert" aria-live="polite" style={{ fontSize: 14, color: "var(--color-text-danger)", marginTop: 8 }}>{prayerError}</div>
          )}
        </div>
      )}

      {prayerTimes && !editingCity && (
        <div className="prayer-arc">
          {/* ARC CENTREPIECE + next-prayer hero, both on a dark "sky" card.
              The card is always dark, so text/marks here use fixed light
              colours — theme vars would invert to dark-on-dark in light mode. */}
          <div className="day-arc-card">
            <DayArc prayerTimes={prayerTimes} prayerDoneToday={prayerDoneToday} />
            {nextPrayer && (() => {
              const due = !!nextPrayer.due;
              const accent = PRAYER_COLORS[nextPrayer.name] || "#e0c06a";
              const eyebrow = due ? "Due now · not prayed" : nextPrayer.tomorrow ? "Tomorrow's first prayer" : "Next prayer";
              return (
                <div className="day-arc-next">
                  <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.13em", textTransform: "uppercase", color: accent }}>{eyebrow}</div>
                  <div className="serif" style={{ fontSize: 30, fontWeight: 600, marginTop: 4, lineHeight: 1.15, color: "#f1efe4" }}>
                    {prayerDisplayName(nextPrayer.name, localDateStr())}
                    <span className="arabic" style={{ fontSize: 22, color: accent, marginLeft: 8, fontWeight: 400 }}>{PRAYER_META[nextPrayer.name]?.ar}</span>
                  </div>
                  <div style={{ fontSize: 15, color: "#c7c3b0", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{nextPrayer.time}</div>
                  {due && (
                    <button onClick={() => markPrayer(nextPrayer.name)} className="pop-in"
                      style={{ marginTop: 14, border: "none", borderRadius: 99, padding: "10px 26px", fontSize: 14, fontWeight: 600, color: "#fff", background: accent, cursor: "pointer" }}>
                      Mark prayed
                    </button>
                  )}
                </div>
              );
            })()}
          </div>

          {/* THE FIVE FARD PRAYERS as compact boxes in a line. Whole box taps
              to mark/unmark; times aren't shown here — they're on the arc. */}
          <div className="pboxes">
            {PRAYERS.filter((p) => p !== "Sunrise" && prayerTimes[p]).map((p) => {
              const color = PRAYER_COLORS[p];
              const done = prayerDoneToday(p);
              const isCurrent = p === currentPrayerName && !done;
              const canMark = canMarkPrayer ? canMarkPrayer(p) : true;
              const disabled = !done && !canMark;
              return (
                <button key={p} type="button"
                  onClick={() => !disabled && markPrayer(p)}
                  disabled={disabled}
                  aria-pressed={done}
                  title={disabled ? `${p} time hasn't started yet (${prayerTimes[p]})` : done ? `${p} prayed — tap to unmark` : `Mark ${p} prayed`}
                  className={`pbox ${done ? "done" : "pending"}${isCurrent ? " now" : ""}${burstKey === p ? " mark-burst" : ""}`}
                  style={{ "--c": color, opacity: disabled ? 0.5 : 1 }}>
                  {isCurrent && <span className="pbox-now">now</span>}
                  <span className="pbox-top" />
                  <span className="pbox-ic"><PrayerIcon name={p} size={20} /></span>
                  <div className="pbox-nm serif">
                    {prayerDisplayName(p, localDateStr())}
                    <span className="arabic">{PRAYER_META[p]?.ar}</span>
                  </div>
                  <div className="pbox-status">{done ? "✓ Prayed" : disabled ? "Upcoming" : "Tap to log"}</div>
                </button>
              );
            })}
          </div>

          {/* Jamāʿah (congregation) times — optional. When set, they override
              the Aladhan start time as what the focus timer counts down to
              (the mosque's jamāʿah is later than the window start). Collapsed by
              default so the page stays calm. */}
          {setJamaahTime && (
            <div style={{ ...S.card, marginBottom: 14 }}>
              <button type="button" onClick={() => setJamaahOpen((o) => !o)} aria-expanded={jamaahOpen}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, width: "100%", background: "transparent", border: "none", cursor: "pointer", padding: 0, textAlign: "left", color: "var(--text-primary)" }}>
                <span style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
                  <span className="serif" style={{ fontSize: 16, fontWeight: 600 }}>Jamāʿah times</span>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>· optional</span>
                </span>
                <span aria-hidden style={{ fontSize: 18, color: "var(--text-muted)", lineHeight: 1, transition: "transform 0.15s ease", transform: jamaahOpen ? "rotate(45deg)" : "none" }}>+</span>
              </button>
              {jamaahOpen && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12, lineHeight: 1.5 }}>
                    Your mosque&apos;s congregation times. When a focus session is running, the timer nudges you as jamāʿah approaches — using these instead of the prayer&apos;s start time.
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"].map((p) => {
                      const color = PRAYER_COLORS[p];
                      const start = typeof prayerTimes?.[p] === "string" ? prayerTimes[p].replace(/\s*\(.+?\)\s*$/, "").trim() : null;
                      const val = jamaahTimes?.[p] || "";
                      const isSet = !!val;
                      const jm = isSet ? toMinutes(val) : null;
                      const sm = start ? toMinutes(start) : null;
                      const offset = jm != null && sm != null ? jm - sm : null;
                      return (
                        <div key={p} style={{
                          display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                          padding: "10px 12px",
                          borderRadius: "var(--border-radius-md)",
                          background: isSet ? `color-mix(in srgb, ${color} 9%, var(--bg-card))` : "var(--color-background-secondary)",
                          border: `0.5px solid ${isSet ? `color-mix(in srgb, ${color} 45%, transparent)` : "var(--color-border-tertiary)"}`,
                          transition: "background 0.2s, border-color 0.2s",
                        }}>
                          <span style={{
                            width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            background: `color-mix(in srgb, ${color} 16%, transparent)`, color,
                          }}><PrayerIcon name={p} size={16} /></span>
                          <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                            <div style={{ fontSize: 15, fontWeight: 500, color: "var(--text-primary)" }}>{p}</div>
                            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 1 }}>
                              {start ? `Starts ${start}` : "Start time —"}
                              {offset != null && offset > 0 && (
                                <span style={{ color }}> · jamāʿah +{offset} min</span>
                              )}
                            </div>
                          </div>
                          <input type="time" value={val}
                            onChange={(e) => setJamaahTime(p, e.target.value)}
                            aria-label={`${p} jamāʿah time`}
                            style={{
                              width: 132, flexShrink: 0, fontSize: 15,
                              padding: "7px 10px", textAlign: "center",
                              color: isSet ? "var(--text-primary)" : "var(--text-muted)",
                              borderColor: isSet ? `color-mix(in srgb, ${color} 50%, transparent)` : undefined,
                              background: isSet ? `color-mix(in srgb, ${color} 6%, var(--input-bg))` : undefined,
                            }} />
                          <div style={{ width: 30, flexShrink: 0, display: "flex", justifyContent: "center" }}>
                            {isSet && (
                              <button type="button" onClick={() => setJamaahTime(p, "")}
                                aria-label={`Clear ${p} jamāʿah time`} title="Clear"
                                style={{
                                  width: 30, height: 30, padding: 0,
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                  borderRadius: 8, background: "transparent",
                                  border: "0.5px solid var(--color-border-tertiary)",
                                  color: "var(--text-muted)", cursor: "pointer",
                                }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Voluntary night prayer (Tahajjud). Nafl — never enters qaza and
              never counts towards Prayer Health. Shows the start of the last
              third of the night when available, plus a streak and a 7-day
              strip. Tap tonight's cell to log it. */}
          {VOLUNTARY_PRAYERS.map((vp) => {
            const color = PRAYER_COLORS[vp];
            const streak = prayerStreak(vp);
            const done = prayerDoneToday(vp);
            const lastThird = prayerTimes?.Lastthird;
            const days = Array.from({ length: 7 }).map((_, i) => {
              const d = new Date();
              d.setDate(d.getDate() - 6 + i);
              return localDateStr(d);
            });
            const todayKey = localDateStr();
            return (
              <div key={vp} style={{ ...S.card, marginBottom: 14, position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: color, opacity: done ? 1 : 0.55 }} />
                <div style={{ display: "flex", alignItems: "center", marginBottom: 10, gap: 10, paddingLeft: 8 }}>
                  <span style={{
                    fontSize: 18, width: 32, height: 32, borderRadius: 10,
                    background: color + "22", display: "flex",
                    alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}><PrayerIcon name={vp} size={18} /></span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 500, color }}>Voluntary · {vp}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                      {lastThird ? `Best after ${lastThird} (last third of the night)` : "Pray in the last third of the night"}
                      {streak > 0 && (<> · <Icon name="flame" size={12} style={{ verticalAlign: "-2px", color: "var(--gold)" }} /> {streak} day streak</>)}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8, paddingLeft: 8 }}>
                  Tap tonight&apos;s cell to log it.
                </div>
                <div style={{ display: "flex", gap: 4, paddingLeft: 8 }}>
                  {days.map((d) => {
                    const dDone = (prayerLog[vp] || []).includes(d);
                    const isToday = d === todayKey;
                    const title = dDone
                      ? `${vp} prayed on ${d} — tap to unmark`
                      : `Mark ${vp} as prayed on ${d}`;
                    return (
                      <button key={d}
                        onClick={() => togglePrayerLogOnDay && togglePrayerLogOnDay(vp, d)}
                        aria-label={title}
                        title={title}
                        style={{
                          flex: 1,
                          height: 22,
                          padding: 0,
                          borderRadius: 4,
                          background: dDone ? color : "var(--color-background-secondary)",
                          border: `0.5px solid ${dDone ? color : isToday ? "var(--color-border-secondary)" : "var(--color-border-tertiary)"}`,
                          color: dDone ? "#fff" : "var(--text-muted)",
                          fontSize: 11,
                          cursor: "pointer",
                        }}>
                        {dDone ? "✓" : ""}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* 7-day tracker — retro-log a prayer you did but forgot to mark.
              Toggling a settled day adjusts qaza (handled in Planner). */}
          <div style={{ ...S.card, marginBottom: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>7-day tracker</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
              Tap any cell to mark / unmark — useful when you prayed but forgot to log it.
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 340 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", color: "var(--text-secondary)", fontWeight: 400, paddingBottom: 8, paddingRight: 8 }}>Prayer</th>
                    {Array.from({ length: 7 }).map((_, i) => {
                      const d = new Date();
                      d.setDate(d.getDate() - 6 + i);
                      return (
                        <th key={i} style={{ textAlign: "center", color: "var(--text-secondary)", fontWeight: 400, paddingBottom: 8, minWidth: 32 }}>
                          {d.getDate()}
                        </th>
                      );
                    })}
                    <th style={{ textAlign: "center", color: "var(--text-secondary)", fontWeight: 400, paddingBottom: 8, paddingLeft: 8 }}>%</th>
                  </tr>
                </thead>
                <tbody>
                  {["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"].map((p) => {
                    const days = Array.from({ length: 7 }).map((_, i) => {
                      const d = new Date();
                      d.setDate(d.getDate() - 6 + i);
                      return localDateStr(d);
                    });
                    const doneCount = days.filter((d) => (prayerLog[p] || []).includes(d)).length;
                    return (
                      <tr key={p}>
                        <td style={{ paddingRight: 8, paddingBottom: 6, color: "var(--text-primary)", whiteSpace: "nowrap" }}>{p}</td>
                        {days.map((d) => {
                          const done = (prayerLog[p] || []).includes(d);
                          const isToday = d === localDateStr();
                          const title = done
                            ? `Marked ${p} on ${d} — tap to unmark`
                            : `Mark ${p} as prayed on ${d}`;
                          return (
                            <td key={d} style={{ textAlign: "center", paddingBottom: 6 }}>
                              <button
                                onClick={() => togglePrayerLogOnDay && togglePrayerLogOnDay(p, d)}
                                aria-label={title}
                                title={title}
                                style={{
                                  width: 24,
                                  height: 24,
                                  padding: 0,
                                  borderRadius: 4,
                                  background: done ? "var(--gold)" : "var(--color-background-secondary)",
                                  border: `0.5px solid ${done ? "var(--gold)" : isToday ? "var(--color-border-secondary)" : "var(--color-border-tertiary)"}`,
                                  margin: "0 auto",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: 12,
                                  color: done ? "#fff" : "var(--text-muted)",
                                  cursor: "pointer",
                                }}>
                                {done ? "✓" : ""}
                              </button>
                            </td>
                          );
                        })}
                        <td style={{
                          textAlign: "center",
                          paddingLeft: 8,
                          fontWeight: 500,
                          color: doneCount === 7 ? "var(--gold)" : doneCount >= 4 ? "var(--color-text-success)" : "var(--text-secondary)",
                        }}>
                          {Math.round((doneCount / 7) * 100)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <RemindersPanel
            notifications={notifications}
            updateNotifications={updateNotifications}
          />
        </div>
      )}
    </div>
  );
}

// The day drawn as the sun's path: an elliptical dome from Fajr (dawn) to
// Isha (night). Each prayer sits along it by its real time; a gold trail +
// marker show how far through the day we are. Pure visualization — the boxes
// below own the mark actions. Rendered on the always-dark "sky" card, so
// colours here are fixed literals (theme vars would invert in light mode).
function DayArc({ prayerTimes, prayerDoneToday }) {
  const CX = 410, CY = 250, RX = 340, RY = 150;
  const GOLD = "#e0c06a", MUTED = "#a8a289", LINE = "rgba(210,180,99,0.18)";
  const toMin = (s) => {
    const m = /^(\d{1,2}):(\d{2})/.exec(String(s || ""));
    return m ? (+m[1]) * 60 + (+m[2]) : null;
  };
  const clamp01 = (n) => Math.max(0, Math.min(1, n));
  // Time → horizontal position (linear), height from the dome equation. Using
  // x-linear (not equal-angle) keeps equal time gaps equal in width, so the
  // evening prayers no longer bunch up near the right horizon.
  const xOf = (f) => CX - RX + f * 2 * RX;
  const yOf = (x) => CY - RY * Math.sqrt(Math.max(0, 1 - ((x - CX) / RX) ** 2));
  const pt = (f) => { const x = xOf(f); return [x, yOf(x)]; };
  const d2 = ([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`;

  const nodes = PRAYERS.filter((p) => prayerTimes[p]);
  const fajr = toMin(prayerTimes.Fajr);
  const isha = toMin(prayerTimes.Isha);
  const span = fajr != null && isha != null && isha > fajr ? isha - fajr : null;
  // Position by true time within the Fajr→Isha span; even spacing as a
  // fallback if a time can't be parsed.
  const fracOf = (p, i) => {
    const t = toMin(prayerTimes[p]);
    if (span && t != null) return clamp01((t - fajr) / span);
    return nodes.length > 1 ? i / (nodes.length - 1) : 0;
  };

  const now = new Date();
  const nowF = span ? clamp01((now.getHours() * 60 + now.getMinutes() - fajr) / span) : 0;
  const [nx, ny] = pt(nowF);

  return (
    <svg viewBox="0 0 820 300" preserveAspectRatio="xMidYMid meet" role="img"
      aria-label="Today's prayers along the arc of the day.">
      <line x1="46" y1={CY} x2="774" y2={CY} stroke={LINE} strokeWidth="1" strokeDasharray="3 5" />
      <path d={`M ${d2(pt(0))} A ${RX} ${RY} 0 0 1 ${d2(pt(1))}`} fill="none" stroke={LINE} strokeWidth="2" />
      <path d={`M ${d2(pt(0))} A ${RX} ${RY} 0 0 1 ${d2(pt(nowF))}`} fill="none" stroke={GOLD} strokeWidth="2.5" opacity="0.85" />
      {nodes.map((p, i) => {
        const f = fracOf(p, i);
        const [x, y] = pt(f);
        const color = PRAYER_COLORS[p];
        const info = p === "Sunrise";
        const done = !info && prayerDoneToday(p);
        // End nodes (Fajr / Isha) sit at the baseline where the arc rises
        // steeply beside them and the now-marker is largest, so a centred
        // label crowds the line/marker. Push those up-and-outward (anchored
        // away from the curve); middle nodes centre straight above.
        const first = i === 0;
        const last = i === nodes.length - 1;
        const anchor = first ? "end" : last ? "start" : "middle";
        const lx = first ? x - 16 : last ? x + 16 : x;
        const nameY = first || last ? y - 24 : y - 38;
        const timeY = first || last ? y - 10 : y - 24;
        return (
          <g key={p}>
            {info ? (
              <circle cx={x} cy={y} r="4" fill={MUTED} />
            ) : done ? (
              <>
                <circle cx={x} cy={y} r="7" fill={color} />
                <text x={x} y={y + 3.5} textAnchor="middle" fontSize="9" fill="#10160f">✓</text>
              </>
            ) : (
              <circle cx={x} cy={y} r="7" fill="rgba(0,0,0,0.32)" stroke={color} strokeWidth="2" />
            )}
            <text x={lx} y={nameY} textAnchor={anchor} fontSize={info ? 10 : 12} fontWeight="600" fill={info ? MUTED : color}>{prayerDisplayName(p, localDateStr())}</text>
            <text x={lx} y={timeY} textAnchor={anchor} fontSize="10" fill={MUTED}>{prayerTimes[p]}</text>
          </g>
        );
      })}
      {/* now marker — a glowing gold disc; its position reads the time of day */}
      <line x1={nx} y1={ny} x2={nx} y2={CY} stroke={GOLD} strokeWidth="1" opacity="0.35" />
      <circle cx={nx} cy={ny} r="16" fill={GOLD} opacity="0.16" />
      <circle cx={nx} cy={ny} r="7" fill={GOLD} stroke="#141a2e" strokeWidth="2" />
    </svg>
  );
}

// Reminders panel — a single toggle that turns prayer-time push
// notifications on or off for all five fard prayers at once. Per-prayer
// granularity stays in the data model (notifications.prayer.perPrayer
// defaults to all true on enable) so the server logic doesn't have to
// change if we surface finer controls later.
function RemindersPanel({ notifications, updateNotifications }) {
  const enabled = notifications?.prayer?.enabled === true;
  // Diagnostics so a silently-broken setup is legible: how many devices have a
  // live FCM token, and when the server last actually sent a push (max of the
  // per-prayer lastSentAt ISO stamps — ISO sorts chronologically).
  const tokenCount = Array.isArray(notifications?.fcmTokens) ? notifications.fcmTokens.length : 0;
  const lastSentIso = Object.values(notifications?.lastSentAt || {}).filter(Boolean).sort().pop() || null;
  const [supported, setSupported] = useState(null);
  const [permission, setPermission] = useState("default");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const needsIosInstall = isIosNeedsInstall();

  useEffect(() => {
    isNotificationsSupported().then(setSupported);
    setPermission(currentPermission());
  }, []);

  // Disabled states: platform can't deliver, user blocked permission, or
  // we're still in flight from a prior tap.
  const blocked = needsIosInstall || supported === false || permission === "denied";
  const disabledHint = needsIosInstall
    ? "On iPhone: Share → Add to Home Screen, then open from the icon."
    : supported === false
      ? "This browser doesn't support push notifications."
      : permission === "denied"
        ? "Notifications are blocked. Re-enable in your browser's site settings, then refresh."
        : "";

  async function toggle() {
    if (blocked || busy) return;
    setError("");
    if (enabled) {
      // Functional updater (not a stale spread of `notifications`) so a
      // concurrent write still in the debounce window — e.g. usePrayer's
      // prayerTimes mirror — isn't clobbered.
      updateNotifications((prev) => ({
        ...prev,
        prayer: { ...(prev?.prayer || {}), enabled: false },
      }));
      return;
    }
    setBusy(true);
    try {
      const { token, timezone } = await requestPermissionAndToken();
      updateNotifications((prev) => {
        const existingTokens = Array.isArray(prev?.fcmTokens) ? prev.fcmTokens : [];
        const existingPerPrayer = prev?.prayer?.perPrayer || {};
        const nextPerPrayer = { Fajr: true, Dhuhr: true, Asr: true, Maghrib: true, Isha: true, ...existingPerPrayer };
        return {
          ...prev,
          prayer: { enabled: true, perPrayer: nextPerPrayer },
          fcmTokens: existingTokens.includes(token) ? existingTokens : [...existingTokens, token],
          timezone,
        };
      });
      setPermission("granted");
    } catch (e) {
      setError(e?.message || "Couldn't enable reminders.");
    }
    setBusy(false);
  }

  // Local display test — asks the active SW to show a notification right now.
  // Verifies THIS device's permission + service-worker display path (the piece
  // that was failing with "no active Service Worker"); it does NOT exercise the
  // server/FCM round-trip, so it's honestly labelled below.
  async function sendTest() {
    setError("");
    try {
      const reg = await navigator.serviceWorker?.ready;
      if (!reg) throw new Error("No active service worker on this device yet — reload and retry.");
      await reg.showNotification("Test reminder ✓", {
        body: "If you can see this, notifications display correctly on this device.",
        icon: "/icon.svg",
        badge: "/icon.svg",
        tag: "prayer-test",
        renotify: true,
      });
    } catch (e) {
      setError(e?.message || "Couldn't show a test notification.");
    }
  }

  // Switch visuals: a 44×24 track with a 20×20 knob that slides on toggle.
  // Color is gold when on, neutral when off, dimmed when blocked. All
  // inline so we don't have to add CSS rules just for one control.
  const trackBase = {
    position: "relative",
    width: 44,
    height: 24,
    borderRadius: 99,
    border: "0.5px solid var(--color-border-secondary)",
    transition: "background 0.18s ease, border-color 0.18s ease",
    flexShrink: 0,
  };
  const track = enabled
    ? { ...trackBase, background: "var(--gold)", borderColor: "var(--gold)" }
    : { ...trackBase, background: "var(--color-background-secondary)" };
  const knob = {
    position: "absolute",
    top: 1,
    left: enabled ? 22 : 1,
    width: 20,
    height: 20,
    borderRadius: "50%",
    background: "#fff",
    transition: "left 0.18s ease",
    boxShadow: "0 1px 2px rgba(0,0,0,0.25)",
  };

  return (
    <div style={{ ...S.card, marginTop: 0 }}>
      <button onClick={toggle} disabled={blocked || busy}
        aria-pressed={enabled}
        aria-label={enabled ? "Turn off prayer reminders" : "Turn on prayer reminders"}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          width: "100%",
          padding: 0,
          background: "transparent",
          border: "none",
          textAlign: "left",
          cursor: blocked || busy ? "not-allowed" : "pointer",
          opacity: blocked ? 0.55 : 1,
        }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 500 }}>Prayer reminders</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
            {busy ? "Asking permission…" : "Push notification at the start of each prayer."}
          </div>
        </div>
        <div style={track}><div style={knob} /></div>
      </button>

      {blocked && disabledHint && (
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 10, lineHeight: 1.5 }}>
          {disabledHint}
        </div>
      )}
      {error && (
        <div role="alert" aria-live="polite" style={{ fontSize: 13, color: "var(--color-text-danger)", marginTop: 10 }}>{error}</div>
      )}

      {/* Diagnostics — visible once reminders are on, so a silent failure
          (token never registered / server never sent) is legible without
          waiting for a real prayer to (not) fire. */}
      {enabled && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "0.5px solid var(--color-border-tertiary)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
              <div>
                {tokenCount > 0 ? (
                  <><span style={{ color: "var(--color-text-success)" }}>✓</span> {tokenCount} device{tokenCount === 1 ? "" : "s"} registered</>
                ) : (
                  <><span style={{ color: "var(--color-text-warning)" }}>⚠</span> No device registered — toggle off, then on</>
                )}
              </div>
              <div>
                {lastSentIso
                  ? `Last reminder sent ${new Date(lastSentIso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`
                  : "No reminder sent yet"}
              </div>
            </div>
            <button type="button" onClick={sendTest}
              style={{ fontSize: 12, padding: "6px 12px", whiteSpace: "nowrap" }}>
              Send a test
            </button>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8, fontStyle: "italic", lineHeight: 1.5 }}>
            “Send a test” shows a notification on this device only — it checks permission + display, not the server delivery.
          </div>
        </div>
      )}
    </div>
  );
}
