/**
 * Insomnia AI – Main Entry Point
 * Orchestrates auth, camera, face detection, drowsiness/distraction analysis,
 * data persistence, navigation, and UI.
 */
import './styles.css';
import { initFaceDetector, detectFace } from './faceDetector.js';
import { analyzeDrowsiness, updateDrowsinessConfig, resetDrowsinessState } from './drowsinessDetector.js';
import { analyzeDistraction, updateDistractionConfig, resetDistractionState } from './distractionDetector.js';
import { initAlertSystem, triggerAlert, onAlert, getAlertCounts, resetAlerts, setSoundEnabled, setAlertVolume } from './alertSystem.js';
import { initUI, getElements, showOverlay, hideOverlay, setConnectionStatus, drawLandmarks, updateMetrics, updateState, resetStateTimer, updateStateTimer, updateStats, addAlertToList, startSessionTimer, stopSessionTimer, clearAlertList } from './ui.js';
import { login, register, logout, getCurrentUser, getSession, onAuthChange } from './auth.js';
import { startSession as startDataSession, endSession as endDataSession, recordEvent } from './dataStore.js';
import { renderDashboard } from './dashboard.js';

let stream = null;
let animationId = null;
let isRunning = false;
let lastState = 'alert';
let currentView = 'detection';

// ── Bootstrap ───────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  setupAuthListeners();
  setupNavListeners();

  // Check if already logged in
  const session = await getSession();
  if (session?.user) {
    showApp(session.user);
  } else {
    showAuth();
  }

  // Listen for auth changes
  onAuthChange((event, session) => {
    if (event === 'SIGNED_IN' && session?.user) {
      showApp(session.user);
    } else if (event === 'SIGNED_OUT') {
      showAuth();
    }
  });
});

// ── Auth ────────────────────────────────────────────
function showAuth() {
  document.getElementById('authScreen').style.display = 'flex';
  document.getElementById('appContent').style.display = 'none';
  // Stop detection if running
  if (isRunning) stopDetection();
}

function showApp(user) {
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('appContent').style.display = 'flex';

  // Init UI if not yet
  initUI();
  setupDetectionListeners();
  setupSettingsListeners();

  // Update user info in header
  const name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuario';
  const avatar = name.charAt(0).toUpperCase();
  const userNameEl = document.getElementById('userName');
  const userAvatarEl = document.getElementById('userAvatar');
  if (userNameEl) userNameEl.textContent = name;
  if (userAvatarEl) userAvatarEl.textContent = avatar;

  showOverlay('👁️', 'Pulsa "Iniciar Detección" para comenzar');
  navigateTo('detection');
}

function setupAuthListeners() {
  // Toggle login/register
  document.getElementById('showRegister')?.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'block';
    clearAuthErrors();
  });

  document.getElementById('showLogin')?.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('registerForm').style.display = 'none';
    document.getElementById('loginForm').style.display = 'block';
    clearAuthErrors();
  });

  // Login
  document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAuthErrors();
    const btn = document.getElementById('loginBtn');
    setAuthLoading(btn, true);

    try {
      const email = document.getElementById('loginEmail').value;
      const password = document.getElementById('loginPassword').value;
      await login(email, password);
    } catch (err) {
      showAuthError('loginError', translateAuthError(err.message));
    } finally {
      setAuthLoading(btn, false);
    }
  });

  // Register
  document.getElementById('registerForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAuthErrors();
    const btn = document.getElementById('registerBtn');
    setAuthLoading(btn, true);

    try {
      const name = document.getElementById('registerName').value;
      const email = document.getElementById('registerEmail').value;
      const password = document.getElementById('registerPassword').value;
      const data = await register(name, email, password);

      // If email confirmation is required
      if (data.user && !data.session) {
        const successEl = document.getElementById('registerSuccess');
        if (successEl) {
          successEl.textContent = '✅ Cuenta creada. Revisa tu email para confirmar tu cuenta.';
          successEl.style.display = 'block';
        }
      }
    } catch (err) {
      showAuthError('registerError', translateAuthError(err.message));
    } finally {
      setAuthLoading(btn, false);
    }
  });

  // Logout
  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    if (isRunning) await stopDetection();
    await logout();
  });
}

function setAuthLoading(btn, loading) {
  if (!btn) return;
  const textEl = btn.querySelector('.auth-btn-text');
  const loadEl = btn.querySelector('.auth-btn-loading');
  if (loading) {
    btn.disabled = true;
    if (textEl) textEl.style.display = 'none';
    if (loadEl) loadEl.style.display = 'inline';
  } else {
    btn.disabled = false;
    if (textEl) textEl.style.display = 'inline';
    if (loadEl) loadEl.style.display = 'none';
  }
}

function showAuthError(id, msg) {
  const el = document.getElementById(id);
  if (el) { el.textContent = '❌ ' + msg; el.style.display = 'block'; }
}

function clearAuthErrors() {
  ['loginError', 'registerError', 'registerSuccess'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = ''; el.style.display = 'none'; }
  });
}

function translateAuthError(msg) {
  if (msg.includes('Invalid login credentials')) return 'Email o contraseña incorrectos';
  if (msg.includes('Email not confirmed')) return 'Debes confirmar tu email antes de iniciar sesión';
  if (msg.includes('User already registered')) return 'Este email ya está registrado';
  if (msg.includes('Password should be at least')) return 'La contraseña debe tener al menos 6 caracteres';
  if (msg.includes('Unable to validate email')) return 'Email no válido';
  return msg;
}

// ── Navigation ──────────────────────────────────────
function setupNavListeners() {
  document.getElementById('navDetection')?.addEventListener('click', () => navigateTo('detection'));
  document.getElementById('navReports')?.addEventListener('click', () => navigateTo('reports'));

  // Date filter buttons
  document.getElementById('dateFilter')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const days = parseInt(btn.dataset.days) || 7;
    renderDashboard(days);
  });
}

function navigateTo(view) {
  currentView = view;
  const detectionView = document.getElementById('detectionView');
  const reportsView = document.getElementById('reportsView');
  const navDetection = document.getElementById('navDetection');
  const navReports = document.getElementById('navReports');

  if (view === 'detection') {
    if (detectionView) detectionView.style.display = 'grid';
    if (reportsView) reportsView.style.display = 'none';
    navDetection?.classList.add('active');
    navReports?.classList.remove('active');
  } else {
    if (detectionView) detectionView.style.display = 'none';
    if (reportsView) reportsView.style.display = 'block';
    navDetection?.classList.remove('active');
    navReports?.classList.add('active');
    renderDashboard(getSelectedDays());
  }
}

function getSelectedDays() {
  const active = document.querySelector('.filter-btn.active');
  return active ? parseInt(active.dataset.days) || 7 : 7;
}

// ── Camera ──────────────────────────────────────────
async function startCamera() {
  const els = getElements();
  try {
    showOverlay('📷', 'Solicitando acceso a la cámara...');
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: false,
    });
    els.videoFeed.srcObject = stream;
    await new Promise(r => { els.videoFeed.onloadeddata = r; });
    els.overlayCanvas.width = els.videoFeed.videoWidth;
    els.overlayCanvas.height = els.videoFeed.videoHeight;
    return true;
  } catch (err) {
    console.error('Camera error:', err);
    showOverlay('❌', 'No se pudo acceder a la cámara');
    return false;
  }
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
}

// ── Detection Loop ──────────────────────────────────
function detectionLoop() {
  const els = getElements();
  const video = els.videoFeed;
  const canvas = els.overlayCanvas;
  if (!isRunning || video.readyState < 2) {
    animationId = requestAnimationFrame(detectionLoop);
    return;
  }

  const timestamp = performance.now();
  const face = detectFace(video, timestamp);

  if (face) {
    const lm = face.landmarks;
    const drowsiness = analyzeDrowsiness(lm);
    const distraction = analyzeDistraction(lm);

    let overallState = 'alert';
    if (drowsiness.state === 'sleeping') overallState = 'sleeping';
    else if (distraction.state === 'distracted') overallState = 'distracted';
    else if (drowsiness.state === 'drowsy') overallState = 'drowsy';

    if (overallState !== lastState) {
      resetStateTimer();
      lastState = overallState;
    }

    if (drowsiness.stateChanged && drowsiness.state === 'drowsy') triggerAlert('drowsy');
    if (drowsiness.stateChanged && drowsiness.state === 'sleeping') triggerAlert('sleeping');
    if (drowsiness.state === 'sleeping') triggerAlert('sleeping');
    if (distraction.stateChanged && distraction.state === 'distracted') triggerAlert('distracted');
    if (drowsiness.yawnDetected) triggerAlert('yawn');

    drawLandmarks(canvas, lm, overallState);
    updateMetrics({ ear: drowsiness.ear, mar: drowsiness.mar, yaw: distraction.yaw, pitch: distraction.pitch, eyesClosed: drowsiness.eyesClosed });
    updateState(overallState === 'sleeping' ? 'sleeping' : overallState);
    updateStateTimer();
    updateStats(getAlertCounts());
  } else {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  animationId = requestAnimationFrame(detectionLoop);
}

// ── Start / Stop ────────────────────────────────────
async function startDetection() {
  const els = getElements();
  initAlertSystem();

  const camOk = await startCamera();
  if (!camOk) return;

  showOverlay('🧠', 'Cargando modelo de IA...');
  const modelOk = await initFaceDetector((msg) => showOverlay('🧠', msg));
  if (!modelOk) {
    showOverlay('❌', 'Error cargando modelo de IA');
    return;
  }

  // Start data session
  try {
    await startDataSession();
  } catch (err) {
    console.error('Error starting data session:', err);
  }

  isRunning = true;
  lastState = 'alert';
  hideOverlay();
  setConnectionStatus(true);
  els.startBtn.style.display = 'none';
  els.stopBtn.style.display = 'flex';
  startSessionTimer();
  resetStateTimer();
  detectionLoop();
}

async function stopDetection() {
  const els = getElements();
  isRunning = false;
  if (animationId) cancelAnimationFrame(animationId);
  stopCamera();
  setConnectionStatus(false);
  if (els.startBtn) els.startBtn.style.display = 'flex';
  if (els.stopBtn) els.stopBtn.style.display = 'none';
  stopSessionTimer();
  resetDrowsinessState();
  resetDistractionState();

  // End data session
  try {
    await endDataSession();
  } catch (err) {
    console.error('Error ending data session:', err);
  }

  resetAlerts();
  clearAlertList();
  showOverlay('👁️', 'Detección detenida');
  updateState('alert');
  if (els.overlayCanvas) {
    const canvas = els.overlayCanvas;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  }
}

// ── Event Listeners ─────────────────────────────────
let detectionListenersSet = false;
function setupDetectionListeners() {
  if (detectionListenersSet) return;
  detectionListenersSet = true;

  const els = getElements();
  els.startBtn?.addEventListener('click', startDetection);
  els.stopBtn?.addEventListener('click', stopDetection);

  // Alert callback – also record events to Supabase
  onAlert((entry) => {
    addAlertToList(entry);
    updateStats(getAlertCounts());
    // Persist event
    recordEvent(entry.type, { text: entry.text });
  });
}

let settingsListenersSet = false;
function setupSettingsListeners() {
  if (settingsListenersSet) return;
  settingsListenersSet = true;

  const els = getElements();

  // Settings panel
  els.toggleSettingsBtn?.addEventListener('click', () => els.settingsOverlay?.classList.add('active'));
  els.closeSettingsBtn?.addEventListener('click', () => els.settingsOverlay?.classList.remove('active'));
  els.settingsOverlay?.addEventListener('click', (e) => { if (e.target === els.settingsOverlay) els.settingsOverlay.classList.remove('active'); });

  // Settings sliders
  const bind = (id, display, fmt, cb) => {
    els[id]?.addEventListener('input', (e) => {
      const v = e.target.value;
      if (els[display]) els[display].textContent = fmt(v);
      cb(v);
    });
  };

  bind('earThreshold', 'earThresholdValue', v => parseFloat(v).toFixed(2), v => updateDrowsinessConfig({ earThreshold: parseFloat(v) }));
  bind('earFrames', 'earFramesValue', v => v, v => updateDrowsinessConfig({ earConsecutiveFrames: parseInt(v) }));
  bind('marThreshold', 'marThresholdValue', v => parseFloat(v).toFixed(2), v => updateDrowsinessConfig({ marThreshold: parseFloat(v) }));
  bind('yawThreshold', 'yawThresholdValue', v => v + '°', v => updateDistractionConfig({ yawThreshold: parseInt(v) }));
  bind('pitchThreshold', 'pitchThresholdValue', v => v + '°', v => updateDistractionConfig({ pitchThreshold: parseInt(v) }));
  bind('distractionFrames', 'distractionFramesValue', v => v, v => updateDistractionConfig({ consecutiveFrames: parseInt(v) }));
  bind('alertVolume', 'alertVolumeValue', v => Math.round(v * 100) + '%', v => setAlertVolume(parseFloat(v)));
  els.soundEnabled?.addEventListener('change', (e) => setSoundEnabled(e.target.checked));
}
