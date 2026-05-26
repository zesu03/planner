import Modal from "./Modal";

// Styled replacement for window.confirm. Pass an `open` flag plus the action
// metadata; `onConfirm` fires only on the primary button. Esc / backdrop /
// the explicit Cancel button all dismiss without firing onConfirm.
//
// `tone="danger"` paints the primary button red — use for destructive actions.
export default function ConfirmDialog({
  open,
  title = "Are you sure?",
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  onConfirm,
  onClose,
}) {
  const danger = tone === "danger";
  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth={420}>
      {message && (
        <div style={{ fontSize: 14, color: "var(--color-text-secondary)", marginBottom: 18, lineHeight: 1.5 }}>
          {message}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={{ fontSize: 14, padding: "7px 14px" }}>
          {cancelLabel}
        </button>
        <button
          onClick={() => { onConfirm?.(); onClose?.(); }}
          autoFocus
          style={{
            fontSize: 14,
            padding: "7px 14px",
            fontWeight: 600,
            background: danger ? "var(--color-background-danger)" : "var(--gold)",
            color: danger ? "var(--color-text-danger)" : "#fff",
            border: `0.5px solid ${danger ? "var(--color-border-danger)" : "var(--gold)"}`,
            borderRadius: "var(--border-radius-md)",
            cursor: "pointer",
          }}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
