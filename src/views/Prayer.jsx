import { PRAYERS, PRAYER_ICONS, PRAYER_COLORS } from "../lib/constants";
import { localDateStr } from "../lib/dates";
import { gold, S } from "../lib/styles";

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
  prayerDoneToday,
  prayerStreak,
}) {
  return (
    <div className="view-content">
      {hijriDate && (
        <div style={{ textAlign: "center", fontSize: 15, color: "var(--gold)", fontWeight: 500, marginBottom: 14 }}>
          {hijriDate}
        </div>
      )}

      {!prayerTimes && (
        <div style={{ ...S.card, marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 14 }}>Set your location</div>
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
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => fetchPrayers(cityInput, countryInput)}
              disabled={prayerLoading || !cityInput.trim() || !countryInput.trim()}
              className="btn-primary"
              style={{ flex: 1, padding: "9px 14px" }}>
              {prayerLoading ? "Loading..." : "Get prayer times"}
            </button>
            <button onClick={fetchByGeo} disabled={prayerLoading} style={{ fontSize: 15 }}>
              Use my location
            </button>
          </div>
          {prayerError && (
            <div style={{ fontSize: 14, color: "var(--color-text-danger)", marginTop: 8 }}>{prayerError}</div>
          )}
        </div>
      )}

      {prayerTimes && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 500 }}>{prayerCity}</div>
              <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>Today's prayer times</div>
            </div>
            <button onClick={() => setPrayerTimes(null)} style={{ fontSize: 14, color: "var(--color-text-secondary)" }}>
              Change city
            </button>
          </div>

          {nextPrayer && (
            <div style={{ ...S.goldCard, display: "flex", alignItems: "center", gap: 14, marginBottom: 14, padding: "14px 18px" }}>
              <span style={{ fontSize: 28 }}>{PRAYER_ICONS[nextPrayer.name]}</span>
              <div>
                <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>Next prayer</div>
                <div style={{ fontSize: 21, fontWeight: 500, color: "var(--gold)" }}>{nextPrayer.name}</div>
                <div style={{ fontSize: 15, color: "var(--color-text-secondary)" }}>{nextPrayer.time}</div>
              </div>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
            {PRAYERS.filter((p) => prayerTimes[p]).map((p) => {
              const done = prayerDoneToday(p);
              const streak = prayerStreak(p);
              const isSunrise = p === "Sunrise";
              const pColor = PRAYER_COLORS[p];
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
                      : "var(--color-background-primary)",
                    borderColor: done ? pColor + "55" : "var(--color-border-tertiary)",
                    overflow: "hidden",
                  }}>
                  {/* prayer-time-of-day accent edge */}
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: pColor, opacity: done ? 1 : 0.55 }} />
                  <span style={{
                    fontSize: 18, width: 32, height: 32, borderRadius: 10,
                    background: pColor + "22", display: "flex",
                    alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>
                    {PRAYER_ICONS[p]}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: 16, color: pColor }}>{p}</div>
                    <div style={{ fontSize: 14, color: "var(--color-text-secondary)" }}>
                      {prayerTimes[p]}{streak > 0 && !isSunrise ? ` · 🔥 ${streak} day streak` : ""}
                    </div>
                  </div>
                  {!isSunrise && (
                    <button onClick={() => togglePrayerLog(p)}
                      style={{
                        fontSize: 14,
                        padding: "5px 14px",
                        borderRadius: 99,
                        background: done ? pColor : "transparent",
                        color: done ? "#fff" : "var(--color-text-secondary)",
                        border: `0.5px solid ${done ? pColor : "var(--color-border-secondary)"}`,
                        cursor: "pointer",
                        transition: "background 0.2s ease, color 0.2s ease, border-color 0.2s ease, transform 0.15s ease",
                        fontWeight: done ? 600 : 400,
                      }}>
                      {done ? <span key="done" className="pop-in" style={{ display: "inline-block" }}>✓ Prayed</span> : "Mark done"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* 7-day tracker */}
          <div style={S.card}>
            <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 12 }}>7-day tracker</div>
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
                          return (
                            <td key={d} style={{ textAlign: "center", paddingBottom: 6 }}>
                              <div style={{
                                width: 20,
                                height: 20,
                                borderRadius: 4,
                                background: done ? gold : "var(--color-background-secondary)",
                                border: `0.5px solid ${done ? gold : "var(--color-border-tertiary)"}`,
                                margin: "0 auto",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 12,
                                color: done ? "#fff" : "var(--color-text-tertiary)",
                              }}>
                                {done ? "✓" : ""}
                              </div>
                            </td>
                          );
                        })}
                        <td style={{
                          textAlign: "center",
                          paddingLeft: 8,
                          fontWeight: 500,
                          color: doneCount === 7 ? gold : doneCount >= 4 ? "var(--color-text-success)" : "var(--color-text-secondary)",
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
        </div>
      )}
    </div>
  );
}
