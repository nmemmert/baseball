// Synthesised sound + haptics. No audio files needed.
export const prefs = { sound: true, haptics: true };
let ctx = null, hxLabel = null;

function ac() {
  if (!prefs.sound) return null;
  try {
    if (!ctx) { const C = window.AudioContext || window.webkitAudioContext; if (C) ctx = new C(); }
    if (ctx && ctx.state === 'suspended') ctx.resume();
  } catch { ctx = null; }
  return ctx;
}

function noise(c, t, dur, type, freq, q, vol, swell = 0) {
  const len = Math.max(1, Math.floor(c.sampleRate * dur)), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  src.buffer = buf; f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(swell ? 0.001 : vol, t);
  if (swell) g.gain.linearRampToValueAtTime(vol, t + swell);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(c.destination); src.start(t); src.stop(t + dur);
}
function tone(c, t, f0, f1, dur, vol, type = 'sine') {
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur);
}

export function initHaptics() {
  if (hxLabel || typeof document === 'undefined') return;
  hxLabel = document.createElement('label');
  hxLabel.setAttribute('aria-hidden', 'true');
  hxLabel.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0.01;pointer-events:none;overflow:hidden';
  hxLabel.innerHTML = '<input type="checkbox" switch tabindex="-1">';
  document.body.appendChild(hxLabel);
}
// Android vibrates; iOS 17.4+ gives a haptic tick when a native switch toggles.
function buzz(pattern) {
  if (!prefs.haptics) return;
  if (navigator.vibrate && !/iPhone|iPad/.test(navigator.userAgent)) { navigator.vibrate(pattern); return; }
  if (!hxLabel) initHaptics();
  let t = 0;
  for (let i = 0; i < pattern.length; i += 2) { setTimeout(() => hxLabel.click(), t); t += pattern[i] + (pattern[i + 1] || 0); }
}

export const fx = {
  hit() { const c = ac(); if (c) { const t = c.currentTime; noise(c, t, 0.07, 'highpass', 2200, 0.7, 0.5); tone(c, t, 220, 90, 0.12, 0.25); } buzz([12]); },
  homer() { const c = ac(); if (c) { const t = c.currentTime; noise(c, t, 0.08, 'highpass', 2000, 0.7, 0.6); tone(c, t, 240, 80, 0.14, 0.3); noise(c, t + 0.1, 1.4, 'bandpass', 900, 0.6, 0.35, 0.5); } buzz([15, 70, 15, 70, 30]); },
  run() { const c = ac(); if (c) noise(c, c.currentTime, 0.9, 'bandpass', 800, 0.7, 0.25, 0.3); buzz([10, 60, 10]); },
  strike() { const c = ac(); if (c) tone(c, c.currentTime, 130, 60, 0.16, 0.35); buzz([20]); },
  out() { const c = ac(); if (c) tone(c, c.currentTime, 160, 90, 0.1, 0.2); buzz([8]); },
  tick() { const c = ac(); if (c) tone(c, c.currentTime, 900, 700, 0.04, 0.12, 'square'); buzz([6]); },
  win() { const c = ac(); if (c) { const t = c.currentTime; [523, 659, 784, 1047].forEach((f, i) => tone(c, t + i * 0.13, f, f, 0.3, 0.2, 'triangle')); noise(c, t + 0.3, 1.6, 'bandpass', 900, 0.6, 0.3, 0.4); } buzz([30, 80, 30, 80, 60]); },
  lose() { const c = ac(); if (c) { const t = c.currentTime; [392, 330, 262].forEach((f, i) => tone(c, t + i * 0.2, f, f * 0.98, 0.35, 0.18, 'triangle')); } buzz([40]); },
};

export function react(ev) {
  if (!ev) return;
  if (ev.result === 'HR') fx.homer();
  else if (['1B', '2B', '3B', 'BUNT'].includes(ev.result)) { fx.hit(); if (ev.runs) setTimeout(fx.run, 140); }
  else if (ev.result === 'K') fx.strike();
  else if (ev.result === 'OUT') { fx.out(); if (ev.runs) setTimeout(fx.run, 120); }
  else if (ev.result === 'BB' || ev.steal === 'SB') { fx.tick(); if (ev.runs) setTimeout(fx.run, 120); }
  else if (ev.steal === 'CS' || ev.result === 'CS') fx.out();
}
