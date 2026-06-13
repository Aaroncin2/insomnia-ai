/**
 * Insomnia AI – Main Entry Point
 * Orchestrates auth, camera, face detection, drowsiness/distraction analysis,
 * data persistence, navigation, and UI.
 * Now includes role-based routing for worker/supervisor/admin.
 */
import './styles.css';
import { initFaceDetector, detectFace } from './faceDetector.js';
import { analyzeDrowsiness, updateDrowsinessConfig, resetDrowsinessState } from './drowsinessDetector.js';
import { analyzeDistraction, updateDistractionConfig, resetDistractionState } from './distractionDetector.js';
import { initAlertSystem, triggerAlert, onAlert, getAlertCounts, resetAlerts, setSoundEnabled, setAlertVolume } from './alertSystem.js';
import { initUI, getElements, showOverlay, hideOverlay, setConnectionStatus, drawLandmarks, updateMetrics, updateState, resetStateTimer, updateStateTimer, updateStats, addAlertToList, startSessionTimer, stopSessionTimer, clearAlertList } from './ui.js';
import { login, register, logout, getCurrentUser, getSession, onAuthChange, getUserProfile, joinGroup, getMyGroups, leaveGroup } from './auth.js';
import { startSession as startDataSession, endSession as endDataSession, recordEvent, recordEventAndCount } from './dataStore.js';
import { renderDashboard } from './dashboard.js';
import { renderSupervisorDashboard, setupSupervisorListeners } from './supervisorDashboard.js';
import { renderAdminPanel, setupAdminListeners } from './adminPanel.js';
import { escapeHtml } from './utils.js';

let stream = null;
let animationId = null;
let isRunning = false;
let lastState = 'alert';
let currentView = 'detection';
let currentUserRole = 'worker';

// ── Bootstrap ───────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  setupAuthListeners();
  setupNavListeners();

  // Check if already logged in
  const session = await getSession();
  if (session) {
    const user = await getCurrentUser();
    if (user) {
      showApp(user);
    } else {
      showAuth();
    }
  } else {
    showAuth();
  }
});

// ── Auth ────────────────────────────────────────────
function showAuth() {
  document.getElementById('authScreen').style.display = 'flex';
  document.getElementById('appContent').style.display = 'none';
  // Stop detection if running
  if (isRunning) stopDetection();
}

async function showApp(user) {
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('appContent').style.display = 'flex';

  // Init UI if not yet
  initUI();
  setupDetectionListeners();
  setupSettingsListeners();

  // Update user info in header
  const name = user.full_name || user.email?.split('@')[0] || 'Usuario';
  const avatar = name.charAt(0).toUpperCase();
  const userNameEl = document.getElementById('userName');
  const userAvatarEl = document.getElementById('userAvatar');
  if (userNameEl) userNameEl.textContent = name;
  if (userAvatarEl) userAvatarEl.textContent = avatar;

  // Fetch role and adapt UI
  const profile = await getUserProfile();
  currentUserRole = profile?.role || 'worker';
  applyRoleUI(currentUserRole);

  // Default navigation
  const defaultView = currentUserRole === 'supervisor' ? 'supervisor' : 'detection';
  navigateTo(defaultView);
  showOverlay('', 'Pulsa "Iniciar Detección" para comenzar');
}

/**
 * Adapt UI elements based on user role.
 */
function applyRoleUI(role) {
  const navDetection = document.getElementById('navDetection');
  const navReports = document.getElementById('navReports');
  const navSupervisor = document.getElementById('navSupervisor');
  const navAdmin = document.getElementById('navAdmin');
  const roleBadge = document.getElementById('userRoleBadge');
  const settingsGroupSection = document.getElementById('settingsGroupSection');

  // Role badge
  const roleLabels = {
    worker: 'Trabajador',
    supervisor: 'Supervisor',
    admin: 'Admin',
  };
  const roleBadgeClasses = {
    worker: 'role-worker',
    supervisor: 'role-supervisor',
    admin: 'role-admin',
  };
  if (roleBadge) {
    roleBadge.textContent = roleLabels[role] || roleLabels.worker;
    roleBadge.className = 'user-role-badge ' + (roleBadgeClasses[role] || '');
  }

  // Show/hide nav tabs based on role
  if (navDetection) navDetection.style.display = 'flex';
  if (navReports) navReports.style.display = 'flex';
  if (navSupervisor) navSupervisor.style.display = (role === 'supervisor' || role === 'admin') ? 'flex' : 'none';
  if (navAdmin) navAdmin.style.display = role === 'admin' ? 'flex' : 'none';

  // Show join group section in settings for workers
  if (settingsGroupSection) {
    settingsGroupSection.style.display = (role === 'worker') ? 'block' : 'none';
  }

  // Setup role-specific listeners
  if (role === 'supervisor' || role === 'admin') {
    setupSupervisorListeners();
  }
  if (role === 'admin') {
    setupAdminListeners();
  }

  // Setup join group modal
  setupJoinGroupListeners();
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
      const data = await login(email, password);
      showApp(data.user);
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
      showApp(data.user);
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
    showAuth();
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
  if (msg.includes('Credenciales incorrectas')) return 'Email o contraseña incorrectos';
  if (msg.includes('ya está registrado')) return 'Este email ya está registrado';
  if (msg.includes('Invalid login credentials')) return 'Email o contraseña incorrectos';
  if (msg.includes('Password should be at least')) return 'La contraseña debe tener al menos 6 caracteres';
  if (msg.includes('value is not a valid email')) return 'Email no válido';
  return msg;
}

// ── Navigation ──────────────────────────────────────
function setupNavListeners() {
  document.getElementById('navDetection')?.addEventListener('click', () => navigateTo('detection'));
  document.getElementById('navReports')?.addEventListener('click', () => navigateTo('reports'));
  document.getElementById('navSupervisor')?.addEventListener('click', () => navigateTo('supervisor'));
  document.getElementById('navAdmin')?.addEventListener('click', () => navigateTo('admin'));

  // Date filter buttons (reports view)
  document.getElementById('dateFilter')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    document.querySelectorAll('#dateFilter .filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const days = parseInt(btn.dataset.days) || 7;
    renderDashboard(days);
  });
}

function navigateTo(view) {
  currentView = view;
  const views = {
    detection: document.getElementById('detectionView'),
    reports: document.getElementById('reportsView'),
    supervisor: document.getElementById('supervisorView'),
    admin: document.getElementById('adminView'),
  };
  const navs = {
    detection: document.getElementById('navDetection'),
    reports: document.getElementById('navReports'),
    supervisor: document.getElementById('navSupervisor'),
    admin: document.getElementById('navAdmin'),
  };

  // Hide all views, deactivate all tabs
  Object.values(views).forEach(v => { if (v) v.style.display = 'none'; });
  Object.values(navs).forEach(n => { if (n) n.classList.remove('active'); });

  // Show selected
  if (views[view]) {
    views[view].style.display = view === 'detection' ? 'grid' : 'block';
  }
  if (navs[view]) navs[view].classList.add('active');

  // Trigger data loading
  if (view === 'reports') {
    renderDashboard(getSelectedDays());
  } else if (view === 'supervisor') {
    renderSupervisorDashboard(getSelectedSupervisorDays());
  } else if (view === 'admin') {
    renderAdminPanel();
  }
}

function getSelectedDays() {
  const active = document.querySelector('#dateFilter .filter-btn.active');
  return active ? parseInt(active.dataset.days) || 7 : 7;
}

function getSelectedSupervisorDays() {
  const active = document.querySelector('#supervisorDateFilter .filter-btn.active');
  return active ? parseInt(active.dataset.days) || 7 : 7;
}

// ── Join Group (Workers) ────────────────────────────
let joinGroupListenersSet = false;
function setupJoinGroupListeners() {
  if (joinGroupListenersSet) return;
  joinGroupListenersSet = true;

  const modal = document.getElementById('joinGroupModal');
  const openBtn = document.getElementById('openJoinGroupBtn');
  const closeBtn = document.getElementById('closeJoinGroupModal');
  const form = document.getElementById('joinGroupForm');

  openBtn?.addEventListener('click', () => {
    modal?.classList.add('active');
    loadMyGroups();
  });

  closeBtn?.addEventListener('click', () => modal?.classList.remove('active'));
  modal?.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const codeInput = document.getElementById('joinGroupCode');
    const errorEl = document.getElementById('joinGroupError');
    const successEl = document.getElementById('joinGroupSuccess');
    const btn = document.getElementById('joinGroupBtn');

    if (!codeInput?.value.trim()) return;

    if (errorEl) { errorEl.style.display = 'none'; errorEl.textContent = ''; }
    if (successEl) { successEl.style.display = 'none'; successEl.textContent = ''; }
    setAuthLoading(btn, true);

    try {
      const result = await joinGroup(codeInput.value.trim());
      if (successEl) {
        successEl.textContent = `✅ Te uniste al grupo "${result.group_name}"`;
        successEl.style.display = 'block';
      }
      codeInput.value = '';
      loadMyGroups();
    } catch (err) {
      if (errorEl) {
        errorEl.textContent = '❌ ' + err.message;
        errorEl.style.display = 'block';
      }
    } finally {
      setAuthLoading(btn, false);
    }
  });
}

async function loadMyGroups() {
  const list = document.getElementById('myGroupsList');
  if (!list) return;

  try {
    const groups = await getMyGroups();
    if (groups.length === 0) {
      list.innerHTML = '<p class="my-groups-empty">No estás en ningún grupo aún</p>';
      return;
    }

    list.innerHTML = groups.map(gm => {
      const g = gm.groups;
      const groupName = escapeHtml(g?.name || 'Grupo');
      return `<div class="my-group-item">
        <div class="my-group-info">
          <span class="group-icon"></span>
          <span class="my-group-name">${groupName}</span>
        </div>
        <button class="admin-action-btn danger leave-group-btn" data-group-id="${g?.id}" title="Salir del grupo">✕</button>
      </div>`;
    }).join('');

    list.querySelectorAll('.leave-group-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const groupId = btn.dataset.groupId;
        if (!confirm('¿Seguro que quieres salir de este grupo?')) return;
        btn.disabled = true;
        btn.textContent = '';
        try {
          await leaveGroup(groupId);
          loadMyGroups();
        } catch (err) {
          console.error('Error leaving group:', err);
          btn.textContent = '❌';
          setTimeout(() => { btn.textContent = '✕'; btn.disabled = false; }, 1500);
        }
      });
    });
  } catch (err) {
    console.error('Error loading groups:', err);
    list.innerHTML = '<p class="my-groups-empty">Error cargando grupos</p>';
  }
}

// ── Camera ──────────────────────────────────────────
async function startCamera() {
  const els = getElements();
  try {
    showOverlay('', 'Solicitando acceso a la cámara...');
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
let backgroundTimerId = null;
const BACKGROUND_FPS = 10; // slower in background to save CPU

function scheduleNextFrame() {
  if (!isRunning) return;
  if (document.hidden) {
    // Tab is hidden: use setTimeout (not throttled by browser)
    backgroundTimerId = setTimeout(detectionLoop, 1000 / BACKGROUND_FPS);
  } else {
    // Tab is visible: use requestAnimationFrame (smooth 60fps)
    animationId = requestAnimationFrame(detectionLoop);
  }
}

function detectionLoop() {
  const els = getElements();
  const video = els.videoFeed;
  const canvas = els.overlayCanvas;
  if (!isRunning || video.readyState < 2) {
    scheduleNextFrame();
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

    // Only update visual UI if tab is visible
    if (!document.hidden) {
      drawLandmarks(canvas, lm, overallState);
      updateMetrics({ ear: drowsiness.ear, mar: drowsiness.mar, yaw: distraction.yaw, pitch: distraction.pitch, eyesClosed: drowsiness.eyesClosed });
      updateState(overallState === 'sleeping' ? 'sleeping' : overallState);
      updateStateTimer();
      updateStats(getAlertCounts());
    }
  } else {
    if (!document.hidden) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  scheduleNextFrame();
}

// ── Start / Stop ────────────────────────────────────
async function startDetection() {
  const els = getElements();
  initAlertSystem();

  const camOk = await startCamera();
  if (!camOk) return;

  showOverlay('', 'Cargando modelo de IA...');
  const modelOk = await initFaceDetector((msg) => showOverlay('', msg));
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
  if (backgroundTimerId) clearTimeout(backgroundTimerId);
  backgroundTimerId = null;
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
  showOverlay('', 'Detección detenida');
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

  // Alert callback – record events to backend
  onAlert((entry) => {
    addAlertToList(entry);
    updateStats(getAlertCounts());
    // Persist event
    recordEventAndCount(entry.type, { text: entry.text });
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
