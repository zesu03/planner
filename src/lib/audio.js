// Focus-end chime via Web Audio. One shared AudioContext, reused across plays.
// Browsers suspend the context until a user gesture; calling resume() on
// every play handles that. Pre-warm by calling getAudioCtx() inside any
// click handler so a later programmatic play (e.g. when a timer fires) is
// allowed to make sound.

let _audioCtx = null;

export function getAudioCtx() {
  try {
    if (!_audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      _audioCtx = new Ctx();
    }
    if (_audioCtx.state === "suspended") _audioCtx.resume().catch(() => {});
    return _audioCtx;
  } catch {
    return null;
  }
}

function playChime(notes, peak = 0.45) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const t0 = ctx.currentTime;
  notes.forEach(({ freq, start, dur }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t0 + start);
    // 8ms attack, exponential decay — softer than a square wave beep.
    gain.gain.setValueAtTime(0.0001, t0 + start);
    gain.gain.linearRampToValueAtTime(peak, t0 + start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
    osc.start(t0 + start);
    osc.stop(t0 + start + dur + 0.05);
  });
}

export function playTimerSound(kind = "focusEnd") {
  try {
    if (kind === "focusEnd") {
      // Ascending major arpeggio C5-E5-G5-C6 — celebratory, "session done".
      // Repeats once after 1.7s for users who stepped away from their screen.
      const arpeggio = [
        { freq: 523.25, start: 0.00, dur: 0.55 },
        { freq: 659.25, start: 0.18, dur: 0.55 },
        { freq: 783.99, start: 0.36, dur: 0.55 },
        { freq: 1046.5, start: 0.54, dur: 0.95 },
      ];
      playChime(arpeggio, 0.55);
      setTimeout(() => playChime(arpeggio, 0.45), 1700);
    } else if (kind === "breakEnd") {
      // Gentle two-note "begin" cue.
      playChime([
        { freq: 880.00, start: 0.00, dur: 0.45 },
        { freq: 587.33, start: 0.22, dur: 0.6 },
      ], 0.4);
    }
  } catch {}
}
