/**
 * Alert System Module
 * Native browser notifications (non-intrusive) + soft chime audio + alert history.
 * Designed to work reliably when the tab is active or in background.
 */

let isEnabled = true;
let alertHistory = [];
let onAlertCallback = null;
let lastAlertTime = {};
let audioCtx = null;
let titleResetTimeout = null;
const originalTitle = document.title || 'Insomnia AI';

/**
 * Initialize Web Audio API context for gentle alert chimes.
 */
function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Play a gentle, non-intrusive soft chime sound.
 * @param {'info' | 'warning' | 'danger'} level 
 */
function playGentleChime(level = 'warning') {
  if (!isEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';

    if (level === 'danger') {
      // Soft two-tone chime for critical alerts (e.g. eyes closed)
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(659.25, now + 0.15); // E5
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc.start(now);
      osc.stop(now + 0.5);
    } else {
      // Very soft single chime for minor alerts
      osc.frequency.setValueAtTime(440, now); // A4
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    }

    osc.connect(gain);
    gain.connect(ctx.destination);
  } catch (err) {
    console.warn('[Insomnia AI] Audio chime failed:', err);
  }
}

/**
 * Initialize the alert system — request notification permission on user action.
 */
export function initAlertSystem() {
  // Resume audio context on user gesture
  getAudioContext();

  if (!('Notification' in window)) {
    console.warn('[Insomnia AI] Browser does not support desktop notifications');
    return;
  }

  if (Notification.permission === 'default') {
    Notification.requestPermission().then((perm) => {
      console.log('[Insomnia AI] Desktop notification permission:', perm);
    });
  }
}

const info = {
  drowsy:     { icon: '😴', text: 'Somnolencia detectada',       level: 'warning', body: 'Se ha detectado somnolencia. Considera tomar un descanso.' },
  sleeping:   { icon: '🚨', text: '¡Ojos cerrados prolongados!', level: 'danger',  body: '¡Alerta! Tus ojos han estado cerrados por un tiempo prolongado.' },
  distracted: { icon: '🔀', text: 'Distracción detectada',       level: 'warning', body: 'Se detectó que no estás mirando la pantalla.' },
  yawn:       { icon: '🥱', text: 'Bostezo detectado',           level: 'info',    body: 'Se detectó un bostezo. ¿Necesitas un descanso?' },
};

/**
 * Show a native browser notification.
 */
function showNotification(type) {
  if (!isEnabled) return;
  if (!('Notification' in window)) return;

  // Dynamically check permission
  if (Notification.permission !== 'granted') {
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
    return;
  }

  const i = info[type];
  if (!i) return;

  try {
    const notification = new Notification(`Insomnia AI — ${i.text}`, {
      body: i.body,
      icon: '/favicon.ico',
      tag: `insomnia-${type}`, // Replaces previous notification of same type
      requireInteraction: type === 'sleeping' || type === 'drowsy', // Stay visible for critical alerts
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
    };

    if (type !== 'sleeping' && type !== 'drowsy') {
      setTimeout(() => notification.close(), 5000);
    }
  } catch (err) {
    console.warn('[Insomnia AI] Desktop notification failed:', err);
  }
}

/**
 * Flash tab title if tab is in background
 */
function flashTabTitle(type) {
  if (!document.hidden) return;
  const i = info[type];
  if (!i) return;

  document.title = `${i.icon} ${i.text} — Insomnia AI`;

  if (titleResetTimeout) clearTimeout(titleResetTimeout);
  titleResetTimeout = setTimeout(() => {
    document.title = originalTitle;
  }, 4000);
}

// Restore title when user returns to tab
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    document.title = originalTitle;
    if (titleResetTimeout) clearTimeout(titleResetTimeout);
  }
});

export function triggerAlert(type) {
  const now = Date.now();
  const minInterval = type === 'sleeping' ? 2000 : 4000;
  if (lastAlertTime[type] && now - lastAlertTime[type] < minInterval) return;
  lastAlertTime[type] = now;

  const i = info[type] || { icon: '⚠️', text: type, level: 'info' };

  // 1. Show native notification banner
  showNotification(type);

  // 2. Play soft, gentle chime (works even in background)
  playGentleChime(i.level);

  // 3. Flash document title if in background
  flashTabTitle(type);

  const entry = {
    type,
    icon: i.icon,
    text: i.text,
    level: i.level,
    timestamp: now,
    timeStr: new Date(now).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  };
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
export function setNotificationsEnabled(e) { isEnabled = e; }
export function resetAlerts() { alertHistory = []; lastAlertTime = {}; }

