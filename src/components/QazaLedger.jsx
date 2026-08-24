import { useState } from "react";
import { PRAYER_COLORS } from "../lib/constants";
import { PrayerIcon, Icon } from "./icons";
import { localDateStr, addDaysToStr } from "../lib/dates";
import { QAZA_PRAYERS, paidOnDay } from "../lib/qaza";
import ProgressBar from "./ProgressBar";
import Modal from "./Modal";
import { S, tintA, goldA } from "../lib/styles";

// Qaza (missed-prayer makeup) ledger — the Prayer tab's accountability centre.
// Reads an explicit stored ledger (see lib/qaza.js) and renders: a hero
// summary with overall make-up progress, a per-prayer row with its own
// progress + stepper, a completion projection, and actions to add a historical
// backlog or mark excused days. All state-touching behaviour arrives as props.
//
// The qaza accent (#c79338, harmonised ochre gold) matches the Stats "Qaza
// balance" card so the two surfaces read as the same feature; per-prayer marks
// use PRAYER_COLORS.
const ACCENT = "#c79338";

const roundBtn = {
  width: 28, height: 28, padding: 0, borderRadius: 99, fontSize: 16, lineHeight: 1,
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  background: "var(--bg-card)", color: "var(--text-secondary)",
  border: "0.5px solid var(--color-border-secondary)",
};
const targetStep = {
  width: 22, height: 22, padding: 0, borderRadius: 99, fontSize: 14, lineHeight: 1,
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  background: "var(--bg-card)", color: "var(--text-secondary)",
  border: "0.5px solid var(--color-border-secondary)", cursor: "pointer",
};
const actionBtn = {
  flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
  padding: "10px 12px", fontSize: 13, color: "var(--text-secondary)",
  background: "transparent", border: "0.5px solid var(--color-border-secondary)",
  borderRadius: 10, cursor: "pointer",
};

export default function QazaLedger({
  qaza,
  qazaOwed,
  payOneQaza,
  undoOneQaza,
  adjustQaza,
  addQazaAll,
  qazaDailyTarget,
  setQazaTarget,
  addExcused,
  removeExcused,
}) {
  const [estimatorOpen, setEstimatorOpen] = useState(false);
  const [excusedOpen, setExcusedOpen] = useState(false);

  const todayKey = localDateStr();
  const owedMap = qazaOwed || {};
  const totalOwed = QAZA_PRAYERS.reduce((s, p) => s + (owedMap[p] || 0), 0);
  const totalMadeUp = QAZA_PRAYERS.reduce((s, p) => s + (qaza?.paidTotal?.[p] || 0), 0);
  const totalMissed = totalOwed + totalMadeUp;
  const paidTodayTotal = paidOnDay(qaza, todayKey);
  const overallPct = totalMissed > 0 ? Math.round((totalMadeUp / totalMissed) * 100) : 0;
  const excusedCount = qaza?.excused?.length || 0;
  const hasHistory = totalMissed > 0;

  return (
    <div style={{ ...S.card, marginBottom: 20 }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ display: "flex", color: ACCENT }}><Icon name="repeat" size={16} /></span>
          <span style={{ fontSize: 15, fontWeight: 600 }}>Qaza ledger</span>
        </div>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>since {qaza?.startDate || "today"}</span>
      </div>

      {/* hero — cleared state vs outstanding-with-progress */}
      {totalOwed === 0 ? (
        <div style={{
          display: "flex", alignItems: "center", gap: 12, padding: "16px",
          borderRadius: 12,
          background: tintA("var(--color-text-success)", 8),
          border: `0.5px solid ${tintA("var(--color-text-success)", 25)}`,
        }}>
          <span style={{ display: "flex", color: "var(--color-text-success)" }}><Icon name="check" size={24} /></span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>
              {hasHistory ? "All caught up — alhamdulillah" : "No qaza to track"}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 2 }}>
              {hasHistory
                ? `You've made up ${totalMadeUp.toLocaleString()} missed prayer${totalMadeUp === 1 ? "" : "s"}.`
                : "If you have older missed prayers, add them below."}
            </div>
          </div>
        </div>
      ) : (
        <div>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
            padding: "14px 16px", borderRadius: 12,
            background: `linear-gradient(135deg, ${tintA(ACCENT, 12)} 0%, ${tintA(ACCENT, 3)} 100%)`,
            border: `0.5px solid ${tintA(ACCENT, 30)}`,
          }}>
            <div>
              <div className="serif" style={{ fontSize: 36, fontWeight: 700, lineHeight: 1, color: "var(--text-primary)" }}>
                {totalOwed.toLocaleString()}
              </div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>
                prayer{totalOwed === 1 ? "" : "s"} to make up
              </div>
            </div>
            {paidTodayTotal > 0 && (
              <span style={{ ...S.pill(goldA(18), "var(--gold)"), fontWeight: 600 }}>
                +{paidTodayTotal} made up today
              </span>
            )}
          </div>
          {totalMadeUp > 0 && (
            <div style={{ marginTop: 10 }}>
              <ProgressBar val={overallPct} color={ACCENT} height={6} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
                <span>{overallPct}% made up</span>
                <span>{totalMadeUp.toLocaleString()} of {totalMissed.toLocaleString()} cleared</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* per-prayer rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
        {QAZA_PRAYERS.map((p) => (
          <QazaRow key={p}
            p={p}
            owed={owedMap[p] || 0}
            paidToday={qaza?.paidLog?.[todayKey]?.[p] || 0}
            paidTotalP={qaza?.paidTotal?.[p] || 0}
            onPay={payOneQaza}
            onUndo={undoOneQaza}
            onAdjust={adjustQaza}
          />
        ))}
      </div>

      <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 10, lineHeight: 1.5 }}>
        A missed prayer settles here after its day ends. Tap <strong>+</strong> as you make one up, or tap a number to adjust it in bulk.
      </div>

      {/* completion projection */}
      {totalOwed > 0 && (() => {
        const target = Math.max(1, qazaDailyTarget || 5);
        const days = Math.ceil(totalOwed / target);
        const clearBy = addDaysToStr(localDateStr(), days);
        const label = new Date(`${clearBy}T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
        const yrs = days / 365;
        return (
          <div style={{
            marginTop: 12, padding: "11px 14px", borderRadius: 10,
            background: "var(--color-background-secondary)",
            border: "0.5px solid var(--color-border-tertiary)",
            display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, fontSize: 13, color: "var(--text-secondary)",
          }}>
            <span style={{ display: "flex", color: ACCENT }}><Icon name="clock" size={15} /></span>
            <span>At</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <button onClick={() => setQazaTarget(target - 1)} disabled={target <= 1}
                aria-label="Fewer per day"
                style={{ ...targetStep, opacity: target <= 1 ? 0.4 : 1, cursor: target <= 1 ? "not-allowed" : "pointer" }}>−</button>
              <strong style={{ color: "var(--text-primary)", minWidth: 18, textAlign: "center" }}>{target}</strong>
              <button onClick={() => setQazaTarget(target + 1)} aria-label="More per day" style={targetStep}>+</button>
            </span>
            <span>a day, cleared by <strong style={{ color: "var(--gold)" }}>~{label}</strong></span>
            <span style={{ color: "var(--text-muted)" }}>· {days.toLocaleString()} day{days === 1 ? "" : "s"}{yrs >= 1 ? ` (~${yrs.toFixed(1)} yr)` : ""}</span>
          </div>
        );
      })()}

      {/* actions */}
      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        <button onClick={() => setEstimatorOpen(true)} style={actionBtn}>
          <Icon name="plus" size={14} /> Add older missed prayers
        </button>
        <button onClick={() => setExcusedOpen(true)} style={actionBtn}>
          <Icon name="calendar" size={14} /> Excused days{excusedCount > 0 ? ` (${excusedCount})` : ""}
        </button>
      </div>

      <QazaEstimator
        open={estimatorOpen}
        onClose={() => setEstimatorOpen(false)}
        currentTotal={totalOwed}
        onAdd={(perPrayer) => { addQazaAll(perPrayer); setEstimatorOpen(false); }}
      />
      <QazaExcused
        open={excusedOpen}
        onClose={() => setExcusedOpen(false)}
        excused={qaza?.excused || []}
        startDate={qaza?.startDate}
        onAdd={addExcused}
        onRemove={removeExcused}
      />
    </div>
  );
}

// One prayer's row: icon + name, a make-up-progress bar, a caption, and the
// stepper. − only reverses a makeup logged today; + is disabled at zero owed
// (see the gating rationale in lib/qaza.js). Tapping the count opens an inline
// input for large per-prayer corrections.
function QazaRow({ p, owed, paidToday, paidTotalP, onPay, onUndo, onAdjust }) {
  const [editing, setEditing] = useState(false);
  const [qty, setQty] = useState("");
  const color = PRAYER_COLORS[p];
  const cleared = owed === 0;
  const total = owed + paidTotalP;
  const madeUpPct = total > 0 ? Math.round((paidTotalP / total) * 100) : 0;
  const apply = (sign) => {
    const n = Math.floor(Number(qty));
    if (!n || n <= 0) return;
    onAdjust(p, sign * n);
    setQty("");
    setEditing(false);
  };
  return (
    <div style={{
      position: "relative", padding: "10px 12px 10px 16px", borderRadius: 10,
      border: `0.5px solid ${cleared ? "var(--color-border-tertiary)" : tintA(color, 40)}`,
      background: cleared ? "var(--bg-card)" : `linear-gradient(135deg, ${tintA(color, 8)} 0%, transparent 65%)`,
      overflow: "hidden",
    }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: color, opacity: cleared ? 0.3 : 1 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ display: "flex", color, flexShrink: 0 }}><PrayerIcon name={p} size={18} /></span>
        <span style={{ fontSize: 14.5, fontWeight: 500, color, flex: 1 }}>{p}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={() => paidToday > 0 && onUndo(p)} disabled={paidToday === 0}
            aria-label={`Undo a ${p} qaza made up today`}
            title={paidToday === 0 ? "Nothing made up today to undo" : `Undo a ${p} qaza made up today`}
            style={{ ...roundBtn, opacity: paidToday === 0 ? 0.35 : 1, cursor: paidToday === 0 ? "default" : "pointer" }}>−</button>
          <button className="serif" onClick={() => setEditing((e) => !e)}
            title={`Adjust ${p} by a specific amount`}
            style={{
              minWidth: 40, textAlign: "center", padding: "0 2px",
              fontSize: 20, fontWeight: 700, lineHeight: 1,
              color: cleared ? "var(--text-muted)" : "var(--text-primary)",
              background: "transparent", border: "none",
              borderBottom: `1px dotted ${tintA(color, 45)}`,
              cursor: "pointer",
            }}>{owed}</button>
          <button onClick={() => owed > 0 && onPay(p)} disabled={owed === 0}
            aria-label={`Mark one ${p} qaza as made up`}
            title={owed === 0 ? `No ${p} qaza outstanding` : `Mark one ${p} qaza as made up`}
            style={{
              ...roundBtn, fontWeight: 600,
              background: owed === 0 ? "transparent" : color,
              color: owed === 0 ? "var(--text-muted)" : "#fff",
              border: `0.5px solid ${owed === 0 ? "var(--color-border-tertiary)" : color}`,
              opacity: owed === 0 ? 0.45 : 1, cursor: owed === 0 ? "not-allowed" : "pointer",
            }}>+</button>
        </div>
      </div>

      <div style={{ marginTop: 8, paddingLeft: 28 }}>
        {!cleared && <ProgressBar val={madeUpPct} color={color} height={4} />}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11.5, marginTop: cleared ? 0 : 5 }}>
          {cleared ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--color-text-success)", fontWeight: 500 }}>
              <Icon name="check" size={12} /> cleared
            </span>
          ) : paidToday > 0 ? (
            <span style={{ color: "var(--color-text-success)", fontWeight: 600 }}>{paidToday} made up today</span>
          ) : paidTotalP > 0 ? (
            <span style={{ color: "var(--text-muted)" }}>{paidTotalP} made up</span>
          ) : (
            <span style={{ color: "var(--text-muted)" }}>none made up yet</span>
          )}
          {!cleared && paidTotalP > 0 && <span style={{ color: "var(--text-muted)" }}>{madeUpPct}%</span>}
        </div>
      </div>

      {editing && (
        <div style={{ display: "flex", gap: 6, marginTop: 10, paddingLeft: 28, alignItems: "center" }}>
          <input type="number" inputMode="numeric" min="1" value={qty}
            onChange={(e) => setQty(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && apply(1)}
            placeholder="qty" aria-label={`Amount to adjust ${p}`}
            style={{ width: 64, fontSize: 13, padding: "4px 6px", boxSizing: "border-box" }} />
          <button onClick={() => apply(1)} disabled={!qty}
            style={{ fontSize: 12, padding: "4px 10px", borderRadius: 8, cursor: qty ? "pointer" : "not-allowed", background: "transparent", border: `0.5px solid ${tintA(color, 45)}`, color }}>Add</button>
          <button onClick={() => apply(-1)} disabled={!qty || owed === 0}
            style={{ fontSize: 12, padding: "4px 10px", borderRadius: 8, cursor: (qty && owed > 0) ? "pointer" : "not-allowed", background: "transparent", border: "0.5px solid var(--color-border-secondary)", color: "var(--text-secondary)", opacity: owed === 0 ? 0.5 : 1 }}>Remove</button>
        </div>
      )}
    </div>
  );
}

// Backlog estimator — turns "roughly how long did I miss prayers" into a
// per-prayer count and adds it to the ledger. Applies equally to all five;
// fine-tune per prayer afterwards with each row's tap-to-edit. Asks the user
// to exclude exempt days (menstruation / pre-puberty / pre-Islam).
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
        padding: "10px 12px", borderRadius: 10,
        background: "var(--color-background-secondary)",
        border: "0.5px solid var(--color-border-tertiary)", marginBottom: 14,
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

const EXCUSE_REASONS = ["Menstruation", "Post-natal bleeding", "Travel", "Illness", "Unconsciousness", "Other"];

// Excused-days manager. Add a date range (with a reason) to remove those days
// from qaza accrual, and review / undo existing ranges. Native YYYY-MM-DD
// inputs (matching storage), capped at today. The un-count / re-count of
// already-settled days lives in addExcusedRange / removeExcusedRange.
function QazaExcused({ open, onClose, excused, startDate, onAdd, onRemove }) {
  const today = localDateStr();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState(EXCUSE_REASONS[0]);
  const valid = from && to && from <= to;
  const field = { width: "100%", boxSizing: "border-box", fontSize: 15, padding: "8px 10px" };
  const label = { fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 };
  const submit = () => {
    if (!valid) return;
    onAdd(from, to, reason);
    setFrom(""); setTo(""); setReason(EXCUSE_REASONS[0]);
  };
  return (
    <Modal open={open} onClose={onClose} title="Excused days">
      <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6, marginTop: 0 }}>
        Obligatory prayers missed during <strong>menstruation</strong> or <strong>post-natal
        bleeding</strong> are not made up. Travel, illness, or unconsciousness may also excuse
        a period. Marking a range removes those days from the qaza ledger and stops future
        days in it from accruing.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div>
          <label style={label}>From</label>
          <input type="date" max={to || today} min={startDate || undefined} value={from} onChange={(e) => setFrom(e.target.value)} style={field} />
        </div>
        <div>
          <label style={label}>To</label>
          <input type="date" max={today} min={from || startDate || undefined} value={to} onChange={(e) => setTo(e.target.value)} style={field} />
        </div>
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={label}>Reason</label>
        <select value={reason} onChange={(e) => setReason(e.target.value)} style={field}>
          {EXCUSE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: excused.length ? 18 : 0 }}>
        <button onClick={submit} disabled={!valid} className="btn-primary"
          style={{ padding: "8px 16px", opacity: valid ? 1 : 0.5, cursor: valid ? "pointer" : "not-allowed" }}>
          Mark excused
        </button>
      </div>

      {excused.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8, color: "var(--text-secondary)" }}>Excused ranges</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {excused.map((r, i) => (
              <div key={`${r.from}-${r.to}-${i}`} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 10px", borderRadius: 8,
                border: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-secondary)",
              }}>
                <div style={{ fontSize: 13 }}>
                  <span style={{ color: "var(--text-primary)" }}>{r.from === r.to ? r.from : `${r.from} → ${r.to}`}</span>
                  {r.reason ? <span style={{ color: "var(--text-muted)" }}> · {r.reason}</span> : null}
                </div>
                <button onClick={() => onRemove(i)} aria-label="Remove excused range"
                  title="Remove — these days go back into the ledger"
                  style={{ fontSize: 13, padding: "3px 10px", borderRadius: 8, background: "transparent", border: "0.5px solid var(--color-border-secondary)", color: "var(--text-secondary)", cursor: "pointer" }}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
