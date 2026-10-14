// Alarm-clock beeps made with the Web Audio API (no sound files).
//
// Browsers only let a page play sound after the player has clicked or pressed a key on it, so
// unlockAudio() runs on the first interaction; after that the alarm also plays while the game's tab
// is in the background. The whole ring is scheduled on the audio clock up front, so it keeps its
// rhythm even when the browser slows down timers in background tabs.

const BEEP_HZ = 988;          // B5, a classic alarm-clock pitch
const BEEP_S = 0.12;
const BEEPS_PER_RING = 4;
const RING_EVERY_S = 1.6;
const VOLUME = 0.12;

let ctx = null;
let master = null;            // gain node for the ring that is playing, cut to stop it

export function unlockAudio() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  if (!ctx) ctx = new AudioCtx();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
}

export const audioReady = () => !!ctx && ctx.state === 'running';

function beep(out, t) {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = 'square';
  osc.frequency.value = BEEP_HZ;
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(VOLUME, t + 0.01);
  env.gain.exponentialRampToValueAtTime(0.0001, t + BEEP_S);
  osc.connect(env).connect(out);
  osc.start(t);
  osc.stop(t + BEEP_S + 0.02);
}

// rings for up to maxSeconds or until stopAlarm(); returns false when sound is not allowed yet
export function startAlarm(maxSeconds = 60) {
  unlockAudio();
  if (!ctx) return false;
  stopAlarm();
  master = ctx.createGain();
  master.connect(ctx.destination);
  const start = ctx.currentTime + 0.05;
  for (let ring = 0; ring * RING_EVERY_S < maxSeconds; ring++) {
    for (let i = 0; i < BEEPS_PER_RING; i++) beep(master, start + ring * RING_EVERY_S + i * 0.18);
  }
  return ctx.state === 'running';
}

export function stopAlarm() {
  if (!master) return;
  const g = master;
  master = null;
  g.gain.setValueAtTime(0, ctx.currentTime);
  setTimeout(() => g.disconnect(), 100);
}
