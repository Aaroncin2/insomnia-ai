/**
 * Alert System Module
 * Audio alerts via Web Audio API + alert history.
 */

let audioCtx = null;
let isEnabled = true;
let volume = 0.7;
let alertHistory = [];
let onAlertCallback = null;
let lastAlertTime = {};

export function initAlertSystem() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

function playBeep(freq, dur, type = 'sine') {
  if (!audioCtx || !isEnabled) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  gain.gain.setValueAtTime(volume * 0.5, audioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + dur);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(audioCtx.currentTime);
  osc.stop(audioCtx.currentTime + dur);
}

const sounds = {
  drowsy: () => { playBeep(600, 0.3); setTimeout(() => playBeep(700, 0.3), 400); },
  sleeping: () => { playBeep(800, 0.2, 'square'); setTimeout(() => playBeep(1000, 0.2, 'square'), 250); setTimeout(() => playBeep(800, 0.2, 'square'), 500); },
  distracted: () => { playBeep(500, 0.15, 'triangle'); setTimeout(() => playBeep(700, 0.25, 'triangle'), 300); },
  yawn: () => { playBeep(400, 0.4); },
};

const info = {
  drowsy: { icon: '😴', text: 'Somnolencia detectada', level: 'warning' },
  sleeping: { icon: '🚨', text: '¡Ojos cerrados prolongados!', level: 'danger' },
  distracted: { icon: '🔀', text: 'Distracción detectada', level: 'warning' },
  yawn: { icon: '🥱', text: 'Bostezo detectado', level: 'info' },
};

export function triggerAlert(type) {
  const now = Date.now();
  const minInterval = type === 'sleeping' ? 2000 : 4000;
  if (lastAlertTime[type] && now - lastAlertTime[type] < minInterval) return;
  lastAlertTime[type] = now;
  if (sounds[type]) sounds[type]();
  const i = info[type] || { icon: '⚠️', text: type, level: 'info' };
  const entry = { type, icon: i.icon, text: i.text, level: i.level, timestamp: now, timeStr: new Date(now).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) };
  alertHistory.unshift(entry);
  if (alertHistory.length > 50) alertHistory.pop();
  if (onAlertCallback) onAlertCallback(entry);
}

export function onAlert(cb) { onAlertCallback = cb; }
export function getAlertHistory() { return alertHistory; }
export function getAlertCounts() {
  const c = { drowsy: 0, sleeping: 0, distracted: 0, yawn: 0, total: 0 };
  for (const e of alertHistory) { if (c[e.type] !== undefined) c[e.type]++; c.total++; }
  return c;
}
export function setSoundEnabled(e) { isEnabled = e; }
export function setAlertVolume(v) { volume = Math.max(0, Math.min(1, v)); }
export function resetAlerts() { alertHistory = []; lastAlertTime = {}; }
