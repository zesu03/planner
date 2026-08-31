import { goldA } from "../../lib/styles";

// Renders the AI Mirror report. Handles both shapes:
//   - new: report.data = { summary, pushBack?, scriptureAnchor?, tomorrow, patterns? }
//   - legacy: report.text = "<prose>... Tomorrow: ..."  (regex-extracted)
// Caller is responsible for the surrounding card chrome.
// (Moved out of views/Muhasaba.jsx during the Phase 5 modular refactor.)
export default function MirrorContent({ report }) {
  // Structured path
  if (report?.data) {
    const d = report.data;
    return (
      <>
        {d.summary && (
          <div style={{ fontSize: 15, color: "var(--text-primary)", lineHeight: 1.65, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {d.summary}
          </div>
        )}

        {d.pushBack && (
          <div style={{
            marginTop: 14,
            padding: "10px 14px",
            borderRadius: "var(--border-radius-md)",
            background: "var(--color-background-warning)",
            border: "0.5px solid rgba(214,168,95,0.4)",
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
          }}>
            <span style={{ fontSize: 11, color: "var(--color-text-warning)", fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase", flexShrink: 0, paddingTop: 2 }}>
              Look here →
            </span>
            <span style={{ fontSize: 14, color: "var(--text-primary)", lineHeight: 1.5 }}>
              {d.pushBack}
            </span>
          </div>
        )}

        {d.scriptureAnchor && (
          <div style={{
            marginTop: 14,
            padding: "12px 14px",
            borderRadius: "var(--border-radius-md)",
            background: `linear-gradient(135deg, ${goldA(10)} 0%, ${goldA(3)} 100%)`,
            border: `0.5px solid ${goldA(32)}`,
          }}>
            <div style={{ fontSize: 11, color: "var(--gold)", fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: 6 }}>
              {d.scriptureAnchor.ref || "Scripture"}
            </div>
            {d.scriptureAnchor.text && (
              <div style={{ fontSize: 14, color: "var(--text-primary)", fontStyle: "italic", lineHeight: 1.55, marginBottom: 6 }}>
                "{d.scriptureAnchor.text}"
              </div>
            )}
            {d.scriptureAnchor.why && (
              <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                {d.scriptureAnchor.why}
              </div>
            )}
          </div>
        )}

        {d.tomorrow && (
          <div style={{
            marginTop: 14,
            padding: "10px 14px",
            borderRadius: "var(--border-radius-md)",
            background: `linear-gradient(135deg, ${goldA(16)} 0%, ${goldA(6)} 100%)`,
            border: `0.5px solid ${goldA(36)}`,
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
          }}>
            <span style={{ fontSize: 11, color: "var(--gold)", fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase", flexShrink: 0, paddingTop: 2 }}>
              Tomorrow →
            </span>
            <span style={{ fontSize: 14, color: "var(--text-primary)", lineHeight: 1.5, fontWeight: 500 }}>
              {d.tomorrow}
            </span>
          </div>
        )}

        {Array.isArray(d.patterns) && d.patterns.length > 0 && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "0.5px dashed var(--color-border-tertiary)" }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 8 }}>
              Patterns observed
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {d.patterns.map((p, i) => (
                <div key={i} style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  lineHeight: 1.45,
                  padding: "6px 10px",
                  background: "var(--color-background-secondary)",
                  borderRadius: "var(--border-radius-md)",
                }}>
                  <span style={{ color: "var(--gold)", fontWeight: 600, marginRight: 6 }}>
                    {p.label || p.kind}:
                  </span>
                  {p.comment}
                </div>
              ))}
            </div>
          </div>
        )}
      </>
    );
  }

  // Legacy text-only path — extract closing Tomorrow: line via regex
  if (report?.text) {
    const m = report.text.match(/^([\s\S]*?)\s*Tomorrow\s*[:\-—]\s*([\s\S]+?)\s*$/i);
    const body = m ? m[1].trim() : report.text;
    const tomorrow = m ? m[2].trim() : null;
    return (
      <>
        <div style={{ fontSize: 15, color: "var(--text-primary)", lineHeight: 1.65, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {body}
        </div>
        {tomorrow && (
          <div style={{
            marginTop: 14,
            padding: "10px 14px",
            borderRadius: "var(--border-radius-md)",
            background: `linear-gradient(135deg, ${goldA(16)} 0%, ${goldA(6)} 100%)`,
            border: `0.5px solid ${goldA(36)}`,
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
          }}>
            <span style={{ fontSize: 11, color: "var(--gold)", fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase", flexShrink: 0, paddingTop: 2 }}>
              Tomorrow →
            </span>
            <span style={{ fontSize: 14, color: "var(--text-primary)", lineHeight: 1.5, fontWeight: 500 }}>
              {tomorrow}
            </span>
          </div>
        )}
      </>
    );
  }
  return null;
}

// Helper for previews — Dashboard teaser, history list. Returns plain text.
export function reportPreviewText(report) {
  if (!report) return null;
  return report.data?.summary || report.text || null;
}
