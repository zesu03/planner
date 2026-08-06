import { useEffect, useState } from "react";
import { PRAYERS, PRAYER_COLORS, VOLUNTARY_PRAYERS } from "../lib/constants";
import { PrayerIcon } from "../components/icons";
import { localDateStr, addDaysToStr } from "../lib/dates";
import { QAZA_PRAYERS, paidOnDay } from "../lib/qaza";
import Modal from "../components/Modal";
import { currentPrayerWindow, prayerDisplayName } from "../lib/prayer";
import { S } from "../lib/styles";
import { rewardPrayerMark } from "../lib/feedback";
import {
  currentPermission,
  isIosNeedsInstall,
  isNotificationsSupported,
  requestPermissionAndToken,
} from "../lib/notifications";

// Small circular ± control used by the projection's daily-target stepper.
const targetStep = {
  width: 22,
  height: 22,
  padding: 0,
  borderRadius: 99,
  fontSize: 14,
  lineHeight: 1,
  background: "var(--bg-card)",
  color: "var(--text-secondary)",
  border: "0.5px solid var(--color-border-secondary)",
  cursor: "pointer",
};

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
  adjustQaza,
  addQazaAll,
  qazaDailyTarget,
  setQazaTarget,
  notifications,
  updateNotifications,
}) {
  // The currently-active prayer window. Null between windows (e.g. between
  // Sunrise and Dhuhr), so the "Now" badge doesn't cling to Fajr after its
  // window has closed.
  const currentPrayerName = currentPrayerWindow(prayerTimes);
  const totalOwed = qazaOwed ? QAZA_PRAYERS.reduce((s, p) => s + (qazaOwed[p] || 0), 0) : 0;
  const todayKeyQaza = localDateStr();
  const paidTodayTotal = paidOnDay(qaza, todayKeyQaza);

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

  // Reward the moment a prayer is *newly* marked (not on unmark): a soft
  // chime + haptic + a brief burst on the row. `burstKey` drives the
  // animation; it auto-clears so the row settles back.
  const [burstKey, setBurstKey] = useState(null);
  const [estimatorOpen, setEstimatorOpen] = useState(false);
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
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 500 }}>{prayerCity}</div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Today's prayer times</div>
            </div>
            <button onClick={() => setEditingCity(true)} style={{ fontSize: 14, color: "var(--text-secondary)" }}>
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
                <span style={{ display: "flex", color: due ? accent : "var(--gold)" }}><PrayerIcon name={nextPrayer.name} size={26} /></span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: due ? accent : "var(--text-secondary)", fontWeight: due ? 600 : 400 }}>{eyebrow}</div>
                  <div style={{ fontSize: 21, fontWeight: 500, color: due ? accent : "var(--gold)" }}>{prayerDisplayName(nextPrayer.name, localDateStr())}</div>
                  <div style={{ fontSize: 15, color: "var(--text-secondary)" }}>{nextPrayer.time}</div>
                </div>
                {due && (
                  <button onClick={() => markPrayer(nextPrayer.name)}
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
                <div key={p} className={`tile-hover${burstKey === p ? " mark-burst" : ""}`}
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
                        : "var(--bg-card)",
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
                    <PrayerIcon name={p} size={20} />
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: 16, color: pColor, display: "flex", alignItems: "center", gap: 8 }}>
                      {prayerDisplayName(p, localDateStr())}
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
                    <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>
                      {prayerTimes[p]}{streak > 0 && !isSunrise ? ` · 🔥 ${streak} day streak` : ""}
                    </div>
                  </div>
                  {!isSunrise && (() => {
                    const canMark = canMarkPrayer ? canMarkPrayer(p) : true;
                    const disabled = !done && !canMark;
                    return (
                      <button onClick={() => !disabled && markPrayer(p)}
                        disabled={disabled}
                        title={disabled ? `${p} time hasn't started yet (${prayerTimes[p]})` : undefined}
                        style={{
                          fontSize: 14,
                          padding: "5px 14px",
                          borderRadius: 99,
                          background: done ? pColor : "transparent",
                          color: done ? "#fff" : "var(--text-secondary)",
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
                    }}><PrayerIcon name={vp} size={18} /></span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 500, color }}>Voluntary · {vp}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                        {lastThird ? `Best after ${lastThird} (last third of the night)` : "Pray in the last third of the night"}
                        {streak > 0 ? ` · 🔥 ${streak} day streak` : ""}
                      </div>
                    </div>
                  </div>
                  {(() => {
                    const canMark = canMarkPrayer ? canMarkPrayer(vp) : true;
                    const disabled = !done && !canMark;
                    return (
                      <button onClick={() => !disabled && markPrayer(vp)}
                        disabled={disabled}
                        title={disabled ? `${vp} can be prayed after Isha (${prayerTimes?.Isha || "tonight"})` : undefined}
                        style={{
                          fontSize: 14,
                          padding: "5px 14px",
                          borderRadius: 99,
                          background: done ? color : "transparent",
                          color: done ? "#fff" : "var(--text-secondary)",
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

          {/* Qaza ledger — missed-prayer makeups owed. Counts past days
              from qaza.startDate up to yesterday; today is still in play
              so it isn't counted as missed yet. */}
          {qazaOwed && (
            <div style={{ ...S.card, marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
                <div style={{ fontSize: 15, fontWeight: 500 }}>Qaza ledger</div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                  {totalOwed > 0 ? `${totalOwed} owed` : "All clear · alhamdulillah"}
                  {paidTodayTotal > 0 ? (
                    <span style={{ color: "var(--color-text-success)" }}> · {paidTodayTotal} made up today</span>
                  ) : ""}
                </div>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
                Outstanding makeups since {qaza?.startDate || "today"}. A missed prayer settles here after its day ends — tap <strong>+</strong> as you make each one up.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
                {QAZA_PRAYERS.map((p) => (
                  <QazaTile key={p}
                    p={p}
                    owed={qazaOwed[p] || 0}
                    paidToday={qaza?.paidLog?.[todayKeyQaza]?.[p] || 0}
                    paidTotalP={qaza?.paidTotal?.[p] || 0}
                    pColor={PRAYER_COLORS[p]}
                    onPay={payOneQaza}
                    onUndo={undoOneQaza}
                    onAdjust={adjustQaza}
                  />
                ))}
              </div>

              {/* Completion projection — only meaningful once something's owed.
                  Pace is a user-set daily target (persisted in settings). */}
              {totalOwed > 0 && (() => {
                const target = Math.max(1, qazaDailyTarget || 5);
                const days = Math.ceil(totalOwed / target);
                const clearBy = addDaysToStr(localDateStr(), days);
                const clearLabel = new Date(`${clearBy}T12:00:00Z`)
                  .toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
                const yrs = days / 365;
                return (
                  <div style={{
                    marginTop: 12,
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "0.5px solid var(--color-border-tertiary)",
                    background: "var(--color-background-secondary)",
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    display: "flex",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 8,
                  }}>
                    <span>At</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <button onClick={() => setQazaTarget(target - 1)} disabled={target <= 1}
                        aria-label="Fewer per day"
                        style={{ ...targetStep, opacity: target <= 1 ? 0.4 : 1, cursor: target <= 1 ? "not-allowed" : "pointer" }}>−</button>
                      <strong style={{ color: "var(--text-primary)", minWidth: 16, textAlign: "center" }}>{target}</strong>
                      <button onClick={() => setQazaTarget(target + 1)} aria-label="More per day" style={targetStep}>+</button>
                    </span>
                    <span>/day → cleared <strong style={{ color: "var(--gold)" }}>~{clearLabel}</strong> ({days.toLocaleString()} day{days === 1 ? "" : "s"}{yrs >= 1 ? ` · ~${yrs.toFixed(1)} yr` : ""})</span>
                  </div>
                );
              })()}

              <button onClick={() => setEstimatorOpen(true)}
                style={{
                  marginTop: 12,
                  width: "100%",
                  padding: "9px 12px",
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  background: "transparent",
                  border: "0.5px dashed var(--color-border-secondary)",
                  borderRadius: 10,
                  cursor: "pointer",
                }}>
                + Add older missed prayers
              </button>
            </div>
          )}

          <QazaEstimator
            open={estimatorOpen}
            onClose={() => setEstimatorOpen(false)}
            currentTotal={totalOwed}
            onAdd={(perPrayer) => { addQazaAll(perPrayer); setEstimatorOpen(false); }}
          />

          {/* 7-day tracker */}
          <div style={S.card}>
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
    </div>
  );
}

// One prayer's qaza cell. Holds its own bulk-edit state: tapping the number
// opens a small add/remove input for large per-prayer corrections (the
// quick +/− stepper only moves one at a time). − only reverses a makeup
// logged today; + is disabled at zero owed (see the gating rationale in
// lib/qaza.js).
function QazaTile({ p, owed, paidToday, paidTotalP, pColor, onPay, onUndo, onAdjust }) {
  const [editing, setEditing] = useState(false);
  const [qty, setQty] = useState("");
  const isClear = owed === 0;
  const apply = (sign) => {
    const n = Math.floor(Number(qty));
    if (!n || n <= 0) return;
    onAdjust(p, sign * n);
    setQty("");
    setEditing(false);
  };
  return (
    <div style={{
      position: "relative",
      padding: "10px 12px",
      borderRadius: 10,
      border: `0.5px solid ${isClear ? "var(--color-border-tertiary)" : pColor + "66"}`,
      background: isClear ? "var(--bg-card)" : `linear-gradient(135deg, ${pColor}0f 0%, ${pColor}05 100%)`,
      overflow: "hidden",
    }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: pColor, opacity: isClear ? 0.3 : 1 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, paddingLeft: 6 }}>
        <span style={{ display: "flex" }}><PrayerIcon name={p} size={14} /></span>
        <span style={{ fontSize: 14, fontWeight: 500, color: pColor }}>{p}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingLeft: 6 }}>
        <div>
          <button onClick={() => setEditing((e) => !e)}
            title={`Adjust ${p} count by a specific amount`}
            style={{
              padding: 0,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontSize: 22,
              fontWeight: 600,
              lineHeight: 1,
              color: isClear ? "var(--text-muted)" : "var(--text-primary)",
              borderBottom: "1px dotted var(--color-border-secondary)",
            }}>
            {owed}
          </button>
          {paidToday > 0 ? (
            <div style={{ fontSize: 11, color: "var(--color-text-success)", fontWeight: 600, marginTop: 2 }}>
              {paidToday} made up today
            </div>
          ) : paidTotalP > 0 ? (
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
              {paidTotalP} made up total
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {paidToday > 0 && (
            <button onClick={() => onUndo(p)}
              title={`Undo a ${p} qaza made up today`}
              style={{
                fontSize: 13,
                padding: "3px 8px",
                borderRadius: 99,
                background: "transparent",
                color: "var(--text-secondary)",
                border: "0.5px solid var(--color-border-secondary)",
                cursor: "pointer",
              }}>−</button>
          )}
          <button onClick={() => owed > 0 && onPay(p)}
            disabled={owed === 0}
            title={owed === 0 ? `No ${p} qaza outstanding` : `Mark one ${p} qaza as made up`}
            style={{
              fontSize: 13,
              fontWeight: 600,
              padding: "3px 10px",
              borderRadius: 99,
              background: owed === 0 ? "transparent" : pColor,
              color: owed === 0 ? "var(--text-muted)" : "#fff",
              border: `0.5px solid ${owed === 0 ? "var(--color-border-tertiary)" : pColor}`,
              cursor: owed === 0 ? "not-allowed" : "pointer",
              opacity: owed === 0 ? 0.5 : 1,
            }}>+</button>
        </div>
      </div>
      {editing && (
        <div style={{ display: "flex", gap: 6, marginTop: 8, paddingLeft: 6, alignItems: "center" }}>
          <input type="number" inputMode="numeric" min="1" value={qty}
            onChange={(e) => setQty(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && apply(1)}
            placeholder="qty"
            aria-label={`Amount to adjust ${p}`}
            style={{ width: 60, fontSize: 13, padding: "3px 6px", boxSizing: "border-box" }} />
          <button onClick={() => apply(1)} disabled={!qty}
            style={{ fontSize: 12, padding: "3px 8px", borderRadius: 8, cursor: qty ? "pointer" : "not-allowed", background: "transparent", border: `0.5px solid ${pColor}66`, color: pColor }}>Add</button>
          <button onClick={() => apply(-1)} disabled={!qty || owed === 0}
            style={{ fontSize: 12, padding: "3px 8px", borderRadius: 8, cursor: (qty && owed > 0) ? "pointer" : "not-allowed", background: "transparent", border: "0.5px solid var(--color-border-secondary)", color: "var(--text-secondary)", opacity: owed === 0 ? 0.5 : 1 }}>Remove</button>
        </div>
      )}
    </div>
  );
}

// Backlog estimator — turns "roughly how long did I miss prayers" into a
// per-prayer count and adds it to the ledger. Applies equally to all five
// (the common "I missed ~N years of everything" case); fine-tune per prayer
// afterwards with each tile's tap-to-edit. Excludes exempt days by asking the
// user not to count them (menstruation / pre-puberty / pre-Islam).
function QazaEstimator({ open, onClose, onAdd, currentTotal }) {
  const [years, setYears] = useState("");
  const [months, setMonths] = useState("");
  const [days, setDays] = useState("");
  const perPrayer = Math.max(0, Math.floor(
    (Number(years) || 0) * 365 + (Number(months) || 0) * 30 + (Number(days) || 0)
  ));
  const total = perPrayer * 5;
  const field = { width: "100%", boxSizing: "border-box", fontSize: 15, padding: "8px 10px" };
  const label = { fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 };
  return (
    <Modal open={open} onClose={onClose} title="Add older missed prayers">
      <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6, marginTop: 0 }}>
        Estimate how long you missed the obligatory prayers. This adds that many to
        <strong> each</strong> of the five. Don&apos;t count days you were exempt — menstruation
        or post-natal bleeding, before puberty, or before Islam.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
        <div>
          <label style={label}>Years</label>
          <input type="number" inputMode="numeric" min="0" value={years} onChange={(e) => setYears(e.target.value)} placeholder="0" style={field} />
        </div>
        <div>
          <label style={label}>Months</label>
          <input type="number" inputMode="numeric" min="0" value={months} onChange={(e) => setMonths(e.target.value)} placeholder="0" style={field} />
        </div>
        <div>
          <label style={label}>Days</label>
          <input type="number" inputMode="numeric" min="0" value={days} onChange={(e) => setDays(e.target.value)} placeholder="0" style={field} />
        </div>
      </div>
      <div style={{
        padding: "10px 12px",
        borderRadius: 10,
        background: "var(--color-background-secondary)",
        border: "0.5px solid var(--color-border-tertiary)",
        marginBottom: 14,
      }}>
        <div style={{ fontSize: 14, color: "var(--text-primary)" }}>
          ≈ <strong>{perPrayer.toLocaleString()}</strong> per prayer · <strong>{total.toLocaleString()}</strong> total
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
          Current outstanding: {currentTotal.toLocaleString()} → {(currentTotal + total).toLocaleString()} after adding.
          Years count as 365 days, months as 30 — round estimates are fine.
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={{ fontSize: 14, padding: "8px 14px" }}>Cancel</button>
        <button onClick={() => onAdd(perPrayer)} disabled={perPrayer === 0} className="btn-primary"
          style={{ padding: "8px 16px", opacity: perPrayer === 0 ? 0.5 : 1, cursor: perPrayer === 0 ? "not-allowed" : "pointer" }}>
          Add to ledger
        </button>
      </div>
    </Modal>
  );
}
