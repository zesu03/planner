import { useEffect } from "react";

// Lightweight modal — backdrop + centred dialog. Closes on Esc or backdrop click.
// `onClose` is required; `title` is rendered as the dialog header.
export default function Modal({ open, onClose, title, children, maxWidth = 560 }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    // lock body scroll while open
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
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
        animation: "fadeUp 0.2s ease-out",
      }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-background-primary)",
          border: "0.5px solid var(--color-border-secondary)",
          borderRadius: "var(--border-radius-lg)",
          padding: "var(--card-padding)",
          maxWidth,
          width: "100%",
          maxHeight: "85vh",
          overflowY: "auto",
          boxShadow: "var(--shadow-modal)",
        }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
          paddingBottom: 10,
          borderBottom: "0.5px solid var(--color-border-tertiary)",
        }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)" }}>{title}</div>
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
              color: "var(--color-text-secondary)",
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
