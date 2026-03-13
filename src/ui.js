/**
 * UI Module
 * Renders face landmarks on canvas, updates dashboard elements.
 */

// Face mesh connections for drawing (simplified – contours)
const FACE_OVAL = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109,10];
const LEFT_EYE_IDX = [33,7,163,144,145,153,154,155,133,173,157,158,159,160,161,246,33];
const RIGHT_EYE_IDX = [362,382,381,380,374,373,390,249,263,466,388,387,386,385,384,398,362];
const LIPS_IDX = [61,146,91,181,84,17,314,405,321,375,291,409,270,269,267,0,37,39,40,185,61];

const els = {};
let stateStartTime = Date.now();
let sessionStartTime = null;
let sessionInterval = null;

export function initUI() {
  // Cache DOM refs
  const ids = ['videoFeed','overlayCanvas','stateOverlay','stateOverlayIcon','stateOverlayText',
    'alertFlash','startBtn','stopBtn','connectionStatus',
    'earValue','marValue','yawValue','pitchValue',
    'earBar','marBar','yawBar','pitchBar',
    'earMetric','marMetric','yawMetric','pitchMetric',
    'stateCard','stateEmoji','stateTitle','stateDescription','timerValue',
    'totalAlerts','drowsinessCount','distractionCount','sessionTime',
    'alertList','settingsOverlay','toggleSettingsBtn','closeSettingsBtn',
    'earThreshold','earFrames','marThreshold','yawThreshold','pitchThreshold','distractionFrames',
    'earThresholdValue','earFramesValue','marThresholdValue','yawThresholdValue','pitchThresholdValue','distractionFramesValue',
    'soundEnabled','alertVolume','alertVolumeValue'];
  ids.forEach(id => { els[id] = document.getElementById(id); });
}

export function getElements() { return els; }

export function showOverlay(icon, text) {
  els.stateOverlay?.classList.remove('hidden');
  if (els.stateOverlayIcon) els.stateOverlayIcon.textContent = icon;
  if (els.stateOverlayText) els.stateOverlayText.textContent = text;
}

export function hideOverlay() {
  els.stateOverlay?.classList.add('hidden');
}

export function setConnectionStatus(active) {
  if (active) {
    els.connectionStatus?.classList.add('active');
    els.connectionStatus.querySelector('.status-text').textContent = 'Activo';
  } else {
    els.connectionStatus?.classList.remove('active');
    els.connectionStatus.querySelector('.status-text').textContent = 'Desconectado';
  }
}

/**
 * Draw face landmarks on overlay canvas.
 */
export function drawLandmarks(canvas, landmarks, state) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (!landmarks) return;

  // Colors based on state
  let color = '#6366f1';
  let eyeColor = '#22c55e';
  if (state === 'drowsy') { color = '#eab308'; eyeColor = '#eab308'; }
  if (state === 'sleeping') { color = '#ef4444'; eyeColor = '#ef4444'; }
  if (state === 'distracted') { color = '#f97316'; eyeColor = '#f97316'; }

  // Draw face oval
  drawConnectors(ctx, landmarks, FACE_OVAL, w, h, color, 1.2, 0.4);
  // Draw eyes
  drawConnectors(ctx, landmarks, LEFT_EYE_IDX, w, h, eyeColor, 1.5, 0.8);
  drawConnectors(ctx, landmarks, RIGHT_EYE_IDX, w, h, eyeColor, 1.5, 0.8);
  // Draw lips
  drawConnectors(ctx, landmarks, LIPS_IDX, w, h, color, 1.2, 0.5);
  // Draw key points
  drawKeyPoints(ctx, landmarks, w, h, eyeColor);
}

function drawConnectors(ctx, lm, indices, w, h, color, lineWidth, alpha) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  for (let i = 0; i < indices.length; i++) {
    const p = lm[indices[i]];
    const x = p.x * w;
    const y = p.y * h;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawKeyPoints(ctx, lm, w, h, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.8;
  // Nose tip, eyes, mouth corners
  [1, 33, 263, 61, 291].forEach(i => {
    const p = lm[i];
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, 3, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

/**
 * Update real-time metric cards.
 */
export function updateMetrics(data) {
  // EAR
  if (els.earValue) els.earValue.textContent = data.ear?.toFixed(3) ?? '--';
  if (els.earBar) {
    const pct = Math.min(100, (data.ear || 0) / 0.4 * 100);
    els.earBar.style.width = pct + '%';
    els.earBar.className = 'metric-bar-fill ' + (data.ear < 0.2 ? 'red' : data.ear < 0.28 ? 'yellow' : 'green');
  }
  if (els.earMetric) els.earMetric.className = 'metric-card' + (data.eyesClosed ? ' danger' : '');

  // MAR
  if (els.marValue) els.marValue.textContent = data.mar?.toFixed(3) ?? '--';
  if (els.marBar) {
    const pct = Math.min(100, (data.mar || 0) / 1.0 * 100);
    els.marBar.style.width = pct + '%';
    els.marBar.className = 'metric-bar-fill ' + (data.mar > 0.6 ? 'yellow' : 'green');
  }

  // Yaw
  if (els.yawValue) els.yawValue.textContent = (data.yaw?.toFixed(1) ?? '--') + '°';
  if (els.yawBar) {
    const pct = Math.min(100, Math.abs(data.yaw || 0) / 45 * 100);
    els.yawBar.style.width = pct + '%';
    els.yawBar.className = 'metric-bar-fill ' + (Math.abs(data.yaw) > 25 ? 'orange' : 'green');
  }

  // Pitch
  if (els.pitchValue) els.pitchValue.textContent = (data.pitch?.toFixed(1) ?? '--') + '°';
  if (els.pitchBar) {
    const pct = Math.min(100, Math.abs(data.pitch || 0) / 45 * 100);
    els.pitchBar.style.width = pct + '%';
    els.pitchBar.className = 'metric-bar-fill ' + (Math.abs(data.pitch) > 20 ? 'orange' : 'green');
  }
}

const stateMap = {
  alert:      { emoji: '✅', title: 'Alerta',     desc: 'Persona atenta y concentrada', cls: 'normal' },
  drowsy:     { emoji: '😴', title: 'Somnoliento', desc: 'Se detecta cierre parcial de ojos', cls: 'warning' },
  sleeping:   { emoji: '🚨', title: '¡Durmiendo!', desc: 'Ojos cerrados prolongadamente', cls: 'danger' },
  distracted: { emoji: '🔀', title: 'Distraído',   desc: 'Mirada fuera de la pantalla', cls: 'distraction' },
};

export function updateState(state) {
  const s = stateMap[state] || stateMap.alert;
  if (els.stateEmoji) els.stateEmoji.textContent = s.emoji;
  if (els.stateTitle) els.stateTitle.textContent = s.title;
  if (els.stateDescription) els.stateDescription.textContent = s.desc;
  if (els.stateCard) els.stateCard.className = 'card state-card ' + s.cls;

  // Alert flash
  if (els.alertFlash) {
    els.alertFlash.className = 'alert-flash';
    if (state === 'sleeping') els.alertFlash.classList.add('danger');
    else if (state === 'drowsy') els.alertFlash.classList.add('warning');
    else if (state === 'distracted') els.alertFlash.classList.add('distraction');
  }
}

export function resetStateTimer() {
  stateStartTime = Date.now();
}

export function updateStateTimer() {
  const elapsed = Math.floor((Date.now() - stateStartTime) / 1000);
  const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const s = String(elapsed % 60).padStart(2, '0');
  if (els.timerValue) els.timerValue.textContent = `${m}:${s}`;
}

export function updateStats(counts) {
  if (els.totalAlerts) els.totalAlerts.textContent = counts.total;
  if (els.drowsinessCount) els.drowsinessCount.textContent = counts.drowsy + counts.sleeping;
  if (els.distractionCount) els.distractionCount.textContent = counts.distracted;
}

export function addAlertToList(entry) {
  if (!els.alertList) return;
  const empty = els.alertList.querySelector('.alert-empty');
  if (empty) empty.remove();
  const div = document.createElement('div');
  div.className = 'alert-item ' + entry.type;
  div.innerHTML = `<span class="alert-item-icon">${entry.icon}</span><div class="alert-item-content"><div class="alert-item-text">${entry.text}</div><div class="alert-item-time">${entry.timeStr}</div></div>`;
  els.alertList.prepend(div);
  // Limit visible items
  while (els.alertList.children.length > 30) els.alertList.lastChild.remove();
}

export function startSessionTimer() {
  sessionStartTime = Date.now();
  if (sessionInterval) clearInterval(sessionInterval);
  sessionInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
    const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const s = String(elapsed % 60).padStart(2, '0');
    if (els.sessionTime) els.sessionTime.textContent = `${m}:${s}`;
  }, 1000);
}

export function stopSessionTimer() {
  if (sessionInterval) clearInterval(sessionInterval);
}

export function clearAlertList() {
  if (!els.alertList) return;
  els.alertList.innerHTML = '<div class="alert-empty"><span>📋</span><p>No hay alertas aún</p></div>';
}
