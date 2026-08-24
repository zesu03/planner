import { useEffect, useRef } from "react";

// Lightweight modal — backdrop + centred dialog. Closes on Esc or backdrop
// click. `onClose` is required; `title` is rendered as the dialog header.
//
// Accessibility: focus is trapped inside the dialog while open (Tab/Shift+Tab
// wrap), moved in on open, and restored to the triggering element on close —
// WCAG 2.1 SC 2.4.3 / 2.1.2. role="dialog" + aria-modal live on the PANEL
// (the actual dialog), not the backdrop.
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Modal({ open, onClose, title, children, maxWidth = 560 }) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement;
    const panel = panelRef.current;
    const focusables = () =>
      panel ? Array.from(panel.querySelectorAll(FOCUSABLE)).filter((el) => el.offsetParent !== null) : [];

    // Move focus into the dialog (first focusable, else the panel itself).
    const first = focusables()[0];
    if (first) first.focus();
    else panel?.focus();

    const onKey = (e) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab") return;
      const els = focusables();
      if (els.length === 0) { e.preventDefault(); panel?.focus(); return; }
      const firstEl = els[0];
      const lastEl = els[els.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault(); lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault(); firstEl.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      if (prevFocus && typeof prevFocus.focus === "function") prevFocus.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(2px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}>
      <div
        ref={panelRef}
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-card)",
          border: "0.5px solid var(--color-border-secondary)",
          borderRadius: "var(--border-radius-lg)",
          padding: "var(--card-padding)",
          maxWidth,
          width: "100%",
          maxHeight: "85vh",
          overflowY: "auto",
          boxShadow: "var(--shadow-modal)",
          outline: "none",
        }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
          paddingBottom: 10,
          borderBottom: "0.5px solid var(--color-border-tertiary)",
        }}>
          <h2 className="serif" style={{ fontSize: 17, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            style={{
              fontSize: 18,
              padding: "4px 10px",
              background: "transparent",
              border: "0.5px solid var(--color-border-tertiary)",
              borderRadius: 8,
              cursor: "pointer",
              color: "var(--text-secondary)",
              lineHeight: 1,
            }}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
