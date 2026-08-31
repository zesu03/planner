import Collapsible from "./Collapsible";

// Yesterday's du'a → today's verdict. The user wrote a commitment last night;
// tonight they answer honestly: honoured, partial, or missed. This is the loop
// that turns daily reflection into actual behavioural feedback.
// (Moved out of views/Muhasaba.jsx during the Phase 5 modular refactor. The
// parent renders it only when yesterdayDua exists, and keys it by day so
// switching days resets the disclosure state.)
export default function DuaVerdict({ yesterdayDua, duaCheck, updateEntry }) {
  const dc = duaCheck || { status: null, note: "" };
  const STATUSES = [
    { value: "honoured", label: "Honoured", color: "var(--color-text-success)", bg: "var(--color-background-success)" },
    { value: "partial",  label: "Partial",  color: "var(--color-text-warning)", bg: "var(--color-background-warning)" },
    { value: "missed",   label: "Missed",   color: "var(--color-text-danger)",  bg: "var(--color-background-danger)" },
  ];
  const setStatus = (next) => {
    const nextStatus = dc.status === next ? null : next; // toggle off
    updateEntry({ duaCheck: { status: nextStatus, note: dc.note || "" } });
  };
  const setNote = (text) => {
    updateEntry({ duaCheck: { status: dc.status, note: text } });
  };
  const verdictLabel = dc.status ? STATUSES.find((s) => s.value === dc.status)?.label : null;
  return (
    <Collapsible
      title="Yesterday's du'a"
      accent="#5fa8aa"
      cardStyle={{ background: "rgba(63,140,160,0.08)", borderColor: "rgba(63,140,160,0.32)" }}
      defaultOpen={!!dc.status}
      summary={verdictLabel || "today is its test"}
    >
      <div style={{ fontSize: 15, color: "var(--text-primary)", fontStyle: "italic", marginBottom: 12 }}>
        "{yesterdayDua}"
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: dc.status ? 10 : 0 }}>
        {STATUSES.map((s) => {
          const active = dc.status === s.value;
          return (
            <button key={s.value} type="button" onClick={() => setStatus(s.value)}
              aria-pressed={active}
              style={{
                fontSize: 13, padding: "5px 12px", borderRadius: 99, cursor: "pointer",
                background: active ? s.bg : "var(--color-background-secondary)",
                border: `0.5px solid ${active ? s.color : "var(--color-border-tertiary)"}`,
                color: active ? s.color : "var(--text-secondary)",
                fontWeight: active ? 600 : 400,
              }}>
              {s.label}
            </button>
          );
        })}
      </div>
      {dc.status && (
        <textarea rows={2} value={dc.note || ""}
          onChange={(e) => setNote(e.target.value)}
          placeholder={
            dc.status === "honoured" ? "How did Allah make it easy? What turned the tide?" :
            dc.status === "partial"  ? "What helped, what got in the way?" :
                                       "What happened? What will I do differently?"
          }
          style={{ width: "100%", resize: "vertical", boxSizing: "border-box", marginTop: 2 }} />
      )}
    </Collapsible>
  );
}
