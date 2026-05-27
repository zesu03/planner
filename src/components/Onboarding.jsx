import { useState } from "react";
import Modal from "./Modal";
import {
  currentPermission,
  isIosNeedsInstall,
  requestPermissionAndToken,
} from "../lib/notifications";

// First-launch setup. Asks for the two permissions that materially change
// what the app can do: location (drives prayer times + qibla-by-coords) and
// push notifications (drives prayer reminders). Renders only when the user
// hasn't already provided each one AND hasn't dismissed this screen.
//
// Permission prompts MUST come from a user gesture — we can't fire
// navigator.geolocation or Notification.requestPermission on mount. So this
// screen surfaces clear buttons; the prompts only appear when the user
// presses them.
//
// Dismissal is persisted in localStorage so the screen doesn't reappear on
// every reload. Users can finish either action later from the Prayer tab.
export default function Onboarding({
  open,
  hasLocation,
  hasNotifications,
  notifications,
  updateNotifications,
  onUseLocation,
  onDismiss,
}) {
  const [locBusy, setLocBusy] = useState(false);
  const [locError, setLocError] = useState("");
  const [notifBusy, setNotifBusy] = useState(false);
  const [notifError, setNotifError] = useState("");
  const needsIosInstall = isIosNeedsInstall();
  const permission = currentPermission();

  async function handleLocation() {
    setLocBusy(true); setLocError("");
    try {
      await onUseLocation();
    } catch (e) {
      setLocError(e?.message || "Couldn't get location.");
    }
    setLocBusy(false);
  }

  async function handleNotifications() {
    setNotifBusy(true); setNotifError("");
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
    } catch (e) {
      setNotifError(e?.message || "Couldn't enable reminders.");
    }
    setNotifBusy(false);
  }

  return (
    <Modal open={open} onClose={onDismiss} title="Welcome — quick setup">
      <div style={{ fontSize: 14, color: "var(--color-text-secondary)", lineHeight: 1.5, marginBottom: 18 }}>
        Two things make the app useful from day one. You can do either, both, or skip and set them up later from the Prayer tab.
      </div>

      <SetupRow
        icon="📍"
        title="Use my location"
        description="So today's prayer times are accurate for where you are. Your city stays on this device — only the coordinates go to Aladhan."
        done={hasLocation}
        busy={locBusy}
        error={locError}
        actionLabel={locBusy ? "Asking…" : "Use my location"}
        onAction={handleLocation}
      />

      <SetupRow
        icon="🔔"
        title="Prayer reminders"
        description="A short push notification at the start of each prayer. Per-prayer toggles live in the Prayer tab once enabled."
        done={hasNotifications}
        busy={notifBusy}
        error={notifError}
        disabled={needsIosInstall || permission === "denied"}
        disabledHint={
          needsIosInstall
            ? "On iPhone: Share → Add to Home Screen first, then open from the home-screen icon."
            : permission === "denied"
              ? "Blocked in browser settings. Re-enable from the site permissions next to the URL."
              : ""
        }
        actionLabel={notifBusy ? "Asking…" : "Enable reminders"}
        onAction={handleNotifications}
      />

      <div style={{ marginTop: 18, textAlign: "center" }}>
        <button onClick={onDismiss}
          style={{
            fontSize: 13,
            background: "transparent",
            color: "var(--color-text-tertiary)",
            border: "none",
            cursor: "pointer",
            padding: "6px 10px",
          }}>
          {hasLocation && hasNotifications ? "Done — close" : "Skip for now"}
        </button>
      </div>
    </Modal>
  );
}

function SetupRow({
  icon, title, description, done, busy, error,
  disabled = false, disabledHint = "",
  actionLabel, onAction,
}) {
  return (
    <div style={{
      display: "flex",
      gap: 12,
      padding: "14px 0",
      borderTop: "0.5px solid var(--color-border-tertiary)",
    }}>
      <div style={{ fontSize: 28, lineHeight: 1, flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 500, color: "var(--color-text-primary)", marginBottom: 4 }}>
          {title}
        </div>
        <div style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.5, marginBottom: 10 }}>
          {description}
        </div>
        {done ? (
          <div style={{ fontSize: 13, color: "var(--gold)", fontWeight: 500 }}>
            ✓ Done
          </div>
        ) : disabled ? (
          <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", lineHeight: 1.5 }}>
            {disabledHint}
          </div>
        ) : (
          <button onClick={onAction} disabled={busy} className="btn-primary"
            style={{ fontSize: 14, padding: "7px 14px" }}>
            {actionLabel}
          </button>
        )}
        {error && (
          <div style={{ fontSize: 12, color: "var(--color-text-danger)", marginTop: 8 }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
