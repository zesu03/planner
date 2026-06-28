// Multi-sensory reward feedback for core actions — haptic + chime, bundled
// so call sites fire one function. Deliberately restrained: a prayer is
// marked up to five times a day, so the cue is a quiet confirm, not a
// fanfare. Both layers degrade silently where unsupported (desktop has no
// Vibration API; iOS Safari lacks it entirely; audio needs a user gesture).

import { getAudioCtx, playTimerSound } from "./audio";

// Short haptic pulse. Long buzzes feel cheap — keep patterns tight.
// No-op where the Vibration API is missing.
export function haptic(pattern = 15) {
  try { navigator.vibrate?.(pattern); } catch { /* unsupported */ }
}

// A prayer was just newly marked. Called from the tap handler so the
// AudioContext is allowed to sound (browsers gate audio to user gestures).
export function rewardPrayerMark() {
  getAudioCtx();
  playTimerSound("prayerMark");
  haptic(18);
}

// A streak / goal milestone was crossed — a brighter, slightly bigger cue.
export function rewardMilestone() {
  getAudioCtx();
  playTimerSound("milestone");
  haptic([0, 28, 38, 28]);
}
