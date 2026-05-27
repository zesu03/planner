import { useEffect, useState } from "react";
import { PRAYERS, PRAYER_ICONS, PRAYER_COLORS, VOLUNTARY_PRAYERS } from "../lib/constants";
import { localDateStr } from "../lib/dates";
import { QAZA_PRAYERS } from "../lib/qaza";
import { currentPrayerWindow } from "../lib/prayer";
import { S } from "../lib/styles";
import {
  currentPermission,
  isIosNeedsInstall,
  isNotificationsSupported,
  requestPermissionAndToken,
} from "../lib/notifications";

// Prayer tab. All state-touching behaviour comes through props so this view
// stays purely presentational.
export default function Prayer({
  prayerTimes,
  prayerCity,
  prayerLog,
  prayerLoading,
  prayerError,
  hijriDate,
  cityInput,
  countryInput,
  nextPrayer,
  setCityInput,
  setCountryInput,
  setPrayerTimes,
  fetchPrayers,
  fetchByGeo,
  togglePrayerLog,
  togglePrayerLogOnDay,
  prayerDoneToday,
  canMarkPrayer,
  prayerStreak,
  qaza,
  qazaOwed,
  payOneQaza,
  undoOneQaza,
  notifications,
  updateNotifications,
}) {
  // The currently-active prayer window. Null between windows (e.g. between
  // Sunrise and Dhuhr), so the "Now" badge doesn't cling to Fajr after its
  // window has closed.
  const currentPrayerName = currentPrayerWindow(prayerTimes);
  const totalOwed = qazaOwed ? QAZA_PRAYERS.reduce((s, p) => s + (qazaOwed[p] || 0), 0) : 0;
  const totalPaid = qaza?.paid ? QAZA_PRAYERS.reduce((s, p) => s + (qaza.paid[p] || 0), 0) : 0;

  // "Change city" used to call setPrayerTimes(null), which dumped the
  // user into the city-input form with no way back if they tapped it by
  // accident. Now it just opens an `editingCity` mode — the user can hit
  // Cancel to return to the existing prayer view, or fetch new times
  // which auto-closes the form via the effect below.
  const [editingCity, setEditingCity] = useState(false);
  useEffect(() => {
    if (prayerTimes) setEditingCity(false);
  }, [prayerTimes]);
  const showCityForm = !prayerTimes || editingCity;
  return (
    <div className="view-content">
      {hijriDate && (
        <div style={{ textAlign: "center", fontSize: 15, color: "var(--gold)", fontWeight: 500, marginBottom: 14 }}>
          {hijriDate}
        </div>
      )}

      {showCityForm && (
        <div style={{ ...S.card, marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 14 }}>
            {prayerTimes ? "Change location" : "Set your location"}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 14, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>City</label>
              <input value={cityInput} onChange={(e) => setCityInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchPrayers(cityInput, countryInput)}
                placeholder="e.g. London"
                style={{ width: "100%", boxSizing: "border-box", fontSize: 15 }} />
            </div>
            <div>
              <label style={{ fontSize: 14, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>Country</label>
              <input value={countryInput} onChange={(e) => setCountryInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchPrayers(cityInput, countryInput)}
                placeholder="e.g. UK"
                style={{ width: "100%", boxSizing: "border-box", fontSize: 15 }} />
            </div>
          </div>
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
            <div style={{ fontSize: 14, color: "var(--color-text-danger)", marginTop: 8 }}>{prayerError}</div>
          )}
        </div>
      )}

      {prayerTimes && !editingCity && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 500 }}>{prayerCity}</div>
              <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>Today's prayer times</div>
            </div>
            <button onClick={() => setEditingCity(true)} style={{ fontSize: 14, color: "var(--color-text-secondary)" }}>
              Change city
            </button>
          </div>

          {nextPrayer && (() => {
            const due = !!nextPrayer.due;
            const accent = due ? (PRAYER_COLORS[nextPrayer.name] || "var(--gold)") : "var(--gold)";
            const eyebrow = due ? "Due now · not prayed" : nextPrayer.tomorrow ? "Tomorrow's first prayer" : "Next prayer";
            return (
              <div style={{
                ...S.goldCard,
                display: "flex",
                alignItems: "center",
                gap: 14,
                marginBottom: 14,
                padding: "14px 18px",
                borderColor: due ? accent + "88" : undefined,
                background: due ? `linear-gradient(90deg, ${accent}1a 0%, ${accent}08 100%)` : undefined,
              }}>
                <span style={{ fontSize: 28 }}>{PRAYER_ICONS[nextPrayer.name]}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: due ? accent : "var(--color-text-secondary)", fontWeight: due ? 600 : 400 }}>{eyebrow}</div>
                  <div style={{ fontSize: 21, fontWeight: 500, color: due ? accent : "var(--gold)" }}>{nextPrayer.name}</div>
                  <div style={{ fontSize: 15, color: "var(--color-text-secondary)" }}>{nextPrayer.time}</div>
                </div>
                {due && (
                  <button onClick={() => togglePrayerLog(nextPrayer.name)}
                    style={{
                      fontSize: 14,
                      padding: "6px 14px",
                      borderRadius: 99,
                      background: accent,
                      color: "#fff",
                      border: `0.5px solid ${accent}`,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}>
                    Mark prayed
                  </button>
                )}
              </div>
            );
          })()}

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
            {PRAYERS.filter((p) => prayerTimes[p]).map((p) => {
              const done = prayerDoneToday(p);
              const streak = prayerStreak(p);
              const isSunrise = p === "Sunrise";
              const pColor = PRAYER_COLORS[p];
              const isCurrent = p === currentPrayerName && !isSunrise && !done;
              return (
                <div key={p} className="tile-hover"
                  style={{
                    ...S.card,
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 16px 12px 22px",
                    transition: "transform 0.12s ease, border-color 0.18s ease, background 0.18s ease",
                    background: done
                      ? `linear-gradient(90deg, ${pColor}14 0%, ${pColor}08 100%)`
                      : isCurrent
                        ? `linear-gradient(90deg, ${pColor}22 0%, ${pColor}0a 100%)`
                        : "var(--color-background-primary)",
                    borderColor: done
                      ? pColor + "55"
                      : isCurrent
                        ? pColor + "88"
                        : "var(--color-border-tertiary)",
                    overflow: "hidden",
                  }}>
                  {/* prayer-time-of-day accent edge */}
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: pColor, opacity: done ? 1 : isCurrent ? 1 : 0.55 }} />
                  <span style={{
                    fontSize: 18, width: 32, height: 32, borderRadius: 10,
                    background: pColor + "22", display: "flex",
                    alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>
                    {PRAYER_ICONS[p]}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: 16, color: pColor, display: "flex", alignItems: "center", gap: 8 }}>
                      {p}
                      {isCurrent && (
                        <span style={{
                          fontSize: 11,
                          fontWeight: 600,
                          letterSpacing: "0.5px",
                          textTransform: "uppercase",
                          padding: "2px 7px",
                          borderRadius: 99,
                          background: pColor,
                          color: "#fff",
                        }}>Now</span>
                      )}
                    </div>
                    <div style={{ fontSize: 14, color: "var(--color-text-secondary)" }}>
                      {prayerTimes[p]}{streak > 0 && !isSunrise ? ` · 🔥 ${streak} day streak` : ""}
                    </div>
                  </div>
                  {!isSunrise && (() => {
                    const canMark = canMarkPrayer ? canMarkPrayer(p) : true;
                    const disabled = !done && !canMark;
                    return (
                      <button onClick={() => !disabled && togglePrayerLog(p)}
                        disabled={disabled}
                        title={disabled ? `${p} time hasn't started yet (${prayerTimes[p]})` : undefined}
                        style={{
                          fontSize: 14,
                          padding: "5px 14px",
                          borderRadius: 99,
                          background: done ? pColor : "transparent",
                          color: done ? "#fff" : "var(--color-text-secondary)",
                          border: `0.5px solid ${done ? pColor : "var(--color-border-secondary)"}`,
                          cursor: disabled ? "not-allowed" : "pointer",
                          opacity: disabled ? 0.4 : 1,
                          transition: "background 0.2s ease, color 0.2s ease, border-color 0.2s ease, transform 0.15s ease",
                          fontWeight: done ? 600 : 400,
                        }}>
                        {done ? <span key="done" className="pop-in" style={{ display: "inline-block" }}>✓ Prayed</span> : disabled ? "Not yet" : "Mark done"}
                      </button>
                    );
                  })()}
                </div>
              );
            })}
          </div>

          {/* Voluntary night prayer (Tahajjud). Nafl — never enters qaza
              and never counts towards Prayer Health. Shows the start of the
              last third of the night when available, plus a streak and a
              7-day strip. Tap a cell to mark / unmark for that day. */}
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
              <div key={vp} style={{ ...S.card, marginBottom: 20, position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: color, opacity: done ? 1 : 0.55 }} />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 10, flexWrap: "wrap", paddingLeft: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <span style={{
                      fontSize: 18, width: 32, height: 32, borderRadius: 10,
                      background: color + "22", display: "flex",
                      alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>{PRAYER_ICONS[vp]}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 500, color }}>Voluntary · {vp}</div>
                      <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 2 }}>
                        {lastThird ? `Best after ${lastThird} (last third of the night)` : "Pray in the last third of the night"}
                        {streak > 0 ? ` · 🔥 ${streak} day streak` : ""}
                      </div>
                    </div>
                  </div>
                  {(() => {
                    const canMark = canMarkPrayer ? canMarkPrayer(vp) : true;
                    const disabled = !done && !canMark;
                    return (
                      <button onClick={() => !disabled && togglePrayerLog(vp)}
                        disabled={disabled}
                        title={disabled ? `${vp} can be prayed after Isha (${prayerTimes?.Isha || "tonight"})` : undefined}
                        style={{
                          fontSize: 14,
                          padding: "5px 14px",
                          borderRadius: 99,
                          background: done ? color : "transparent",
                          color: done ? "#fff" : "var(--color-text-secondary)",
                          border: `0.5px solid ${done ? color : "var(--color-border-secondary)"}`,
                          cursor: disabled ? "not-allowed" : "pointer",
                          opacity: disabled ? 0.4 : 1,
                          fontWeight: done ? 600 : 400,
                        }}>
                        {done ? "✓ Prayed" : disabled ? "Not yet" : "Mark done"}
                      </button>
                    );
                  })()}
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
                          color: dDone ? "#fff" : "var(--color-text-tertiary)",
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

          {/* Qaza ledger — missed-prayer makeups owed. Counts past days
              from qaza.startDate up to yesterday; today is still in play
              so it isn't counted as missed yet. */}
          {qazaOwed && (
            <div style={{ ...S.card, marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
                <div style={{ fontSize: 15, fontWeight: 500 }}>Qaza ledger</div>
                <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                  {totalOwed > 0 ? `${totalOwed} owed` : "All clear · alhamdulillah"}
                  {totalPaid > 0 ? ` · ${totalPaid} made up` : ""}
                </div>
              </div>
              <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginBottom: 12 }}>
                Tracking since {qaza?.startDate || "today"}. Tap <strong>+</strong> when you make one up as qaza.
                {totalOwed > 0 && (
                  <> Prayed on time but forgot to mark it? Tick the missed day in the 7-day tracker below — it won't count as qaza.</>
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
                {QAZA_PRAYERS.map((p) => {
                  const owed = qazaOwed[p] || 0;
                  const paid = qaza?.paid?.[p] || 0;
                  const pColor = PRAYER_COLORS[p];
                  const isClear = owed === 0;
                  return (
                    <div key={p} style={{
                      position: "relative",
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: `0.5px solid ${isClear ? "var(--color-border-tertiary)" : pColor + "66"}`,
                      background: isClear ? "var(--color-background-primary)" : `linear-gradient(135deg, ${pColor}0f 0%, ${pColor}05 100%)`,
                      overflow: "hidden",
                    }}>
                      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: pColor, opacity: isClear ? 0.3 : 1 }} />
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, paddingLeft: 6 }}>
                        <span style={{ fontSize: 14 }}>{PRAYER_ICONS[p]}</span>
                        <span style={{ fontSize: 14, fontWeight: 500, color: pColor }}>{p}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingLeft: 6 }}>
                        <div>
                          <div style={{ fontSize: 22, fontWeight: 600, lineHeight: 1, color: isClear ? "var(--color-text-tertiary)" : "var(--color-text-primary)" }}>
                            {owed}
                          </div>
                          {paid > 0 && (
                            <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 2 }}>
                              {paid} paid
                            </div>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 4 }}>
                          {paid > 0 && (
                            <button onClick={() => undoOneQaza(p)}
                              title="Undo last made-up qaza"
                              style={{
                                fontSize: 13,
                                padding: "3px 8px",
                                borderRadius: 99,
                                background: "transparent",
                                color: "var(--color-text-secondary)",
                                border: "0.5px solid var(--color-border-secondary)",
                                cursor: "pointer",
                              }}>−</button>
                          )}
                          <button onClick={() => payOneQaza(p)}
                            title={`Mark one ${p} qaza as made up`}
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              padding: "3px 10px",
                              borderRadius: 99,
                              background: pColor,
                              color: "#fff",
                              border: `0.5px solid ${pColor}`,
                              cursor: "pointer",
                            }}>+</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 7-day tracker */}
          <div style={S.card}>
            <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>7-day tracker</div>
            <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginBottom: 12 }}>
              Tap any cell to mark / unmark — useful when you prayed but forgot to log it.
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 340 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", color: "var(--color-text-secondary)", fontWeight: 400, paddingBottom: 8, paddingRight: 8 }}>Prayer</th>
                    {Array.from({ length: 7 }).map((_, i) => {
                      const d = new Date();
                      d.setDate(d.getDate() - 6 + i);
                      return (
                        <th key={i} style={{ textAlign: "center", color: "var(--color-text-secondary)", fontWeight: 400, paddingBottom: 8, minWidth: 32 }}>
                          {d.getDate()}
                        </th>
                      );
                    })}
                    <th style={{ textAlign: "center", color: "var(--color-text-secondary)", fontWeight: 400, paddingBottom: 8, paddingLeft: 8 }}>%</th>
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
                        <td style={{ paddingRight: 8, paddingBottom: 6, color: "var(--color-text-primary)", whiteSpace: "nowrap" }}>{p}</td>
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
                                  color: done ? "#fff" : "var(--color-text-tertiary)",
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
                          color: doneCount === 7 ? "var(--gold)" : doneCount >= 4 ? "var(--color-text-success)" : "var(--color-text-secondary)",
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

// Reminders panel — a single toggle that turns prayer-time push
// notifications on or off for all five fard prayers at once. Per-prayer
// granularity stays in the data model (notifications.prayer.perPrayer
// defaults to all true on enable) so the server logic doesn't have to
// change if we surface finer controls later.
function RemindersPanel({ notifications, updateNotifications }) {
  const enabled = notifications?.prayer?.enabled === true;
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
      updateNotifications({
        ...notifications,
        prayer: { ...(notifications?.prayer || {}), enabled: false },
      });
      return;
    }
    setBusy(true);
    try {
      const { token, timezone } = await requestPermissionAndToken();
      const existingTokens = Array.isArray(notifications?.fcmTokens) ? notifications.fcmTokens : [];
      const existingPerPrayer = notifications?.prayer?.perPrayer || {};
      const nextPerPrayer = { Fajr: true, Dhuhr: true, Asr: true, Maghrib: true, Isha: true, ...existingPerPrayer };
      updateNotifications({
        ...notifications,
        prayer: { enabled: true, perPrayer: nextPerPrayer },
        fcmTokens: existingTokens.includes(token) ? existingTokens : [...existingTokens, token],
        timezone,
      });
      setPermission("granted");
    } catch (e) {
      setError(e?.message || "Couldn't enable reminders.");
    }
    setBusy(false);
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
    <div style={{ ...S.card, marginTop: 20 }}>
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
          <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 2 }}>
            {busy ? "Asking permission…" : "Push notification at the start of each prayer."}
          </div>
        </div>
        <div style={track}><div style={knob} /></div>
      </button>

      {blocked && disabledHint && (
        <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 10, lineHeight: 1.5 }}>
          {disabledHint}
        </div>
      )}
      {error && (
        <div style={{ fontSize: 13, color: "var(--color-text-danger)", marginTop: 10 }}>{error}</div>
      )}
    </div>
  );
}
