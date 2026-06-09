/**
 * Supervisor Dashboard Module
 * Renders group-level analytics for supervisors:
 * - Worker cards with status indicators
 * - Group selector
 * - Per-worker drill-down dashboard
 * - Risk ranking table
 */
import Chart from 'chart.js/auto';
import { getSupervisorGroups, getGroupMembers, getWorkerSessions, getWorkerEvents, getGroupSessions, getGroupEvents } from './dataStore.js';

let charts = {};
let currentGroupId = null;
let currentWorkerId = null; // null = show all

const CHART_COLORS = {
  drowsy: { bg: 'rgba(234, 179, 8, 0.7)', border: '#eab308' },
  sleeping: { bg: 'rgba(239, 68, 68, 0.7)', border: '#ef4444' },
  distracted: { bg: 'rgba(249, 115, 22, 0.7)', border: '#f97316' },
  yawn: { bg: 'rgba(139, 92, 246, 0.7)', border: '#8b5cf6' },
};

const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: '#94a3b8', font: { family: "'Inter', sans-serif" } } },
  },
  scales: {
    y: {
      beginAtZero: true,
      ticks: { color: '#94a3b8' },
      grid: { color: 'rgba(148,163,184,0.08)' },
    },
    x: {
      ticks: { color: '#94a3b8' },
      grid: { color: 'rgba(148,163,184,0.05)' },
    },
  },
};

/**
 * Initialize the supervisor view. Loads groups and renders.
 */
export async function renderSupervisorDashboard(days = 7) {
  const loading = document.getElementById('supervisorLoading');
  const content = document.getElementById('supervisorContent');

  if (loading) loading.style.display = 'flex';
  if (content) content.style.opacity = '0.4';

  try {
    const groups = await getSupervisorGroups();
    renderGroupSelector(groups);

    if (groups.length === 0) {
      showNoGroupsMessage();
      return;
    }

    // Use first group if none selected
    if (!currentGroupId || !groups.find(g => g.id === currentGroupId)) {
      currentGroupId = groups[0].id;
    }

    await renderGroupDashboard(currentGroupId, days);
  } catch (err) {
    console.error('Supervisor dashboard error:', err);
  } finally {
    if (loading) loading.style.display = 'none';
    if (content) content.style.opacity = '1';
  }
}

function showNoGroupsMessage() {
  const content = document.getElementById('supervisorContent');
  const loading = document.getElementById('supervisorLoading');
  if (loading) loading.style.display = 'none';
  if (content) {
    content.style.opacity = '1';
    content.innerHTML = `
      <div class="supervisor-empty">
        <h3>Sin grupos asignados</h3>
        <p>El administrador aún no te ha asignado ningún grupo de trabajadores.</p>
      </div>`;
  }
}

// ── Group Selector ──────────────────────────────────

function renderGroupSelector(groups) {
  const container = document.getElementById('supervisorGroupSelector');
  if (!container) return;

  if (groups.length <= 1) {
    container.innerHTML = groups.length === 1
      ? `<div class="supervisor-group-pill active">
           <span class="group-icon"></span>
           <span>${groups[0].name}</span>
           <span class="group-code-mini">${groups[0].code}</span>
         </div>`
      : '';
    return;
  }

  container.innerHTML = groups.map(g => `
    <button class="supervisor-group-pill ${g.id === currentGroupId ? 'active' : ''}"
            data-group-id="${g.id}">
      <span class="group-icon"></span>
      <span>${g.name}</span>
      <span class="group-code-mini">${g.code}</span>
    </button>
  `).join('');

  container.querySelectorAll('.supervisor-group-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      currentGroupId = btn.dataset.groupId;
      currentWorkerId = null;
      renderSupervisorDashboard(getSelectedSupervisorDays());
    });
  });
}

function getSelectedSupervisorDays() {
  const active = document.querySelector('#supervisorDateFilter .filter-btn.active');
  return active ? parseInt(active.dataset.days) || 7 : 7;
}

// ── Group Dashboard ─────────────────────────────────

async function renderGroupDashboard(groupId, days) {
  const [members, sessions, events] = await Promise.all([
    getGroupMembers(groupId),
    getGroupSessions(groupId, days),
    getGroupEvents(groupId, days),
  ]);

  renderWorkerCards(members, sessions, events);
  renderSupervisorKPIs(sessions, events, members);
  renderRiskRanking(members, sessions, events);
  renderSupervisorTrendChart(events, days);
  renderSupervisorDistributionChart(events);
}

// ── Worker Cards ────────────────────────────────────

function renderWorkerCards(members, sessions, events) {
  const grid = document.getElementById('workerCardsGrid');
  if (!grid) return;

  if (members.length === 0) {
    grid.innerHTML = `
      <div class="supervisor-empty-inline">
        <span></span>
        <p>No hay trabajadores en este grupo</p>
      </div>`;
    return;
  }

  grid.innerHTML = members.map(m => {
    const name = m.profiles?.full_name || 'Sin nombre';
    const avatar = name.charAt(0).toUpperCase();
    const workerSessions = sessions.filter(s => s.user_id === m.user_id);
    const workerEvents = events.filter(e => e.user_id === m.user_id);

    const totalAlerts = workerEvents.length;
    const totalSessions = workerSessions.length;
    const totalTime = workerSessions.reduce((acc, s) => acc + (s.duration_seconds || 0), 0);
    const hours = Math.floor(totalTime / 3600);
    const mins = Math.floor((totalTime % 3600) / 60);

    // Last session
    const lastSession = workerSessions[0];
    let lastActive = 'Nunca';
    if (lastSession) {
      const d = new Date(lastSession.started_at);
      lastActive = d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) + ' ' +
        d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    }

    // Risk level
    const riskLevel = getRiskLevel(totalAlerts, totalSessions);
    const isSelected = currentWorkerId === m.user_id;

    return `<div class="worker-card ${riskLevel} ${isSelected ? 'selected' : ''}" data-worker-id="${m.user_id}">
      <div class="worker-card-header">
        <div class="worker-avatar-wrap">
          <span class="worker-avatar">${avatar}</span>
          <span class="worker-risk-dot ${riskLevel}"></span>
        </div>
        <div class="worker-info">
          <h4>${name}</h4>
          <span class="worker-last-active">Última sesión: ${lastActive}</span>
        </div>
      </div>
      <div class="worker-card-stats">
        <div class="worker-stat">
          <span class="worker-stat-value">${totalAlerts}</span>
          <span class="worker-stat-label">Alertas</span>
        </div>
        <div class="worker-stat">
          <span class="worker-stat-value">${totalSessions}</span>
          <span class="worker-stat-label">Sesiones</span>
        </div>
        <div class="worker-stat">
          <span class="worker-stat-value">${hours}h ${mins}m</span>
          <span class="worker-stat-label">Tiempo</span>
        </div>
      </div>
      <button class="worker-detail-btn" data-worker-id="${m.user_id}" data-worker-name="${name}">
        Ver detalle →
      </button>
    </div>`;
  }).join('');

  // Bind detail buttons
  grid.querySelectorAll('.worker-detail-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const workerId = btn.dataset.workerId;
      const workerName = btn.dataset.workerName;
      showWorkerDetail(workerId, workerName);
    });
  });
}

function getRiskLevel(alerts, sessions) {
  if (sessions === 0) return 'inactive';
  const avg = alerts / sessions;
  if (avg >= 10) return 'high-risk';
  if (avg >= 5) return 'medium-risk';
  return 'low-risk';
}

// ── KPIs ────────────────────────────────────────────

function renderSupervisorKPIs(sessions, events, members) {
  const el = (id) => document.getElementById(id);

  const totalWorkers = el('supKpiWorkers');
  const totalAlerts = el('supKpiAlerts');
  const totalSessions = el('supKpiSessions');
  const totalTime = el('supKpiTime');

  if (totalWorkers) totalWorkers.textContent = members.length;
  if (totalAlerts) totalAlerts.textContent = events.length;
  if (totalSessions) totalSessions.textContent = sessions.length;

  if (totalTime) {
    const seconds = sessions.reduce((acc, s) => acc + (s.duration_seconds || 0), 0);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    totalTime.textContent = `${h}h ${m}m`;
  }
}

// ── Risk Ranking ────────────────────────────────────

function renderRiskRanking(members, sessions, events) {
  const tbody = document.getElementById('riskRankingBody');
  if (!tbody) return;

  const rankings = members.map(m => {
    const name = m.profiles?.full_name || 'Sin nombre';
    const workerSessions = sessions.filter(s => s.user_id === m.user_id);
    const workerEvents = events.filter(e => e.user_id === m.user_id);

    const drowsy = workerEvents.filter(e => e.type === 'drowsy' || e.type === 'sleeping').length;
    const distracted = workerEvents.filter(e => e.type === 'distracted').length;
    const yawns = workerEvents.filter(e => e.type === 'yawn').length;
    const total = workerEvents.length;
    const sessCount = workerSessions.length;
    const avg = sessCount > 0 ? (total / sessCount).toFixed(1) : '0';

    return { name, total, drowsy, distracted, yawns, sessCount, avg, userId: m.user_id };
  });

  // Sort by total alerts desc
  rankings.sort((a, b) => b.total - a.total);

  if (rankings.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="table-empty">No hay datos</td></tr>';
    return;
  }

  tbody.innerHTML = rankings.map((r, i) => {
    const riskClass = r.total >= 20 ? 'high-risk' : r.total >= 10 ? 'medium-risk' : 'low-risk';
    return `<tr class="${riskClass}">
      <td>
        <div class="admin-user-cell">
          <span class="rank-number">#${i + 1}</span>
          <span>${r.name}</span>
        </div>
      </td>
      <td><span class="badge total">${r.total}</span></td>
      <td><span class="badge drowsy">${r.drowsy}</span></td>
      <td><span class="badge distracted">${r.distracted}</span></td>
      <td><span class="badge yawn">${r.yawns}</span></td>
      <td>${r.avg} / sesión</td>
    </tr>`;
  }).join('');
}

// ── Supervisor Charts ───────────────────────────────

function destroyChart(key) {
  if (charts[key]) {
    charts[key].destroy();
    delete charts[key];
  }
}

function renderSupervisorTrendChart(events, days) {
  const dayMap = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    dayMap[key] = { drowsy: 0, sleeping: 0, distracted: 0, yawn: 0 };
  }

  events.forEach(e => {
    const key = e.timestamp.split('T')[0];
    if (dayMap[key] && dayMap[key][e.type] !== undefined) {
      dayMap[key][e.type]++;
    }
  });

  const labels = Object.keys(dayMap).map(d => {
    const date = new Date(d + 'T12:00:00');
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
  });

  destroyChart('supTrend');
  const ctx = document.getElementById('supTrendChart');
  if (!ctx) return;

  charts.supTrend = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Somnolencia',
          data: Object.values(dayMap).map(d => d.drowsy + d.sleeping),
          borderColor: CHART_COLORS.drowsy.border,
          backgroundColor: 'rgba(234, 179, 8, 0.1)',
          tension: 0.4,
          fill: true,
        },
        {
          label: 'Distracción',
          data: Object.values(dayMap).map(d => d.distracted),
          borderColor: CHART_COLORS.distracted.border,
          backgroundColor: 'rgba(249, 115, 22, 0.1)',
          tension: 0.4,
          fill: true,
        },
        {
          label: 'Bostezos',
          data: Object.values(dayMap).map(d => d.yawn),
          borderColor: CHART_COLORS.yawn.border,
          backgroundColor: 'rgba(139, 92, 246, 0.1)',
          tension: 0.4,
          fill: true,
        },
      ],
    },
    options: CHART_DEFAULTS,
  });
}

function renderSupervisorDistributionChart(events) {
  const counts = { drowsy: 0, sleeping: 0, distracted: 0, yawn: 0 };
  events.forEach(e => { if (counts[e.type] !== undefined) counts[e.type]++; });

  destroyChart('supDistribution');
  const ctx = document.getElementById('supDistributionChart');
  if (!ctx) return;

  charts.supDistribution = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Somnolencia', 'Dormido', 'Distracción', 'Bostezos'],
      datasets: [{
        data: [counts.drowsy, counts.sleeping, counts.distracted, counts.yawn],
        backgroundColor: [CHART_COLORS.drowsy.bg, CHART_COLORS.sleeping.bg, CHART_COLORS.distracted.bg, CHART_COLORS.yawn.bg],
        borderColor: ['rgba(10,14,23,0.8)'],
        borderWidth: 3,
        hoverOffset: 8,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#94a3b8', padding: 16, font: { family: "'Inter', sans-serif" } },
        },
      },
    },
  });
}

// ── Worker Detail Modal ─────────────────────────────

async function showWorkerDetail(workerId, workerName) {
  const modal = document.getElementById('workerDetailModal');
  const title = document.getElementById('workerDetailTitle');
  const content = document.getElementById('workerDetailContent');
  if (!modal) return;

  currentWorkerId = workerId;
  if (title) title.textContent = workerName;
  if (content) content.innerHTML = '<div class="admin-loading"> Cargando datos...</div>';
  modal.classList.add('active');

  const days = getSelectedSupervisorDays();

  try {
    const [sessions, events] = await Promise.all([
      getWorkerSessions(workerId, days),
      getWorkerEvents(workerId, days),
    ]);

    renderWorkerDetailContent(content, sessions, events, days, workerName);
  } catch (err) {
    console.error('Error loading worker detail:', err);
    if (content) content.innerHTML = '<div class="admin-empty-state"><p>Error cargando datos</p></div>';
  }
}

function renderWorkerDetailContent(container, sessions, events, days, workerName) {
  if (!container) return;

  const totalAlerts = events.length;
  const totalSessions = sessions.length;
  const totalSeconds = sessions.reduce((acc, s) => acc + (s.duration_seconds || 0), 0);
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const avg = totalSessions > 0 ? (totalAlerts / totalSessions).toFixed(1) : '0';

  const drowsy = events.filter(e => e.type === 'drowsy' || e.type === 'sleeping').length;
  const distracted = events.filter(e => e.type === 'distracted').length;
  const yawns = events.filter(e => e.type === 'yawn').length;

  container.innerHTML = `
    <div class="worker-detail-kpis">
      <div class="kpi-card compact">
        <div class="kpi-info">
          <span class="kpi-value">${totalAlerts}</span>
          <span class="kpi-label">Alertas</span>
        </div>
      </div>
      <div class="kpi-card compact">
        <div class="kpi-info">
          <span class="kpi-value">${totalSessions}</span>
          <span class="kpi-label">Sesiones</span>
        </div>
      </div>
      <div class="kpi-card compact">
        <div class="kpi-info">
          <span class="kpi-value">${hours}h ${mins}m</span>
          <span class="kpi-label">Tiempo</span>
        </div>
      </div>
      <div class="kpi-card compact">
        <div class="kpi-info">
          <span class="kpi-value">${avg}</span>
          <span class="kpi-label">Prom/Sesión</span>
        </div>
      </div>
    </div>

    <div class="worker-detail-charts">
      <div class="chart-card">
        <h3> Distribución de Alertas</h3>
        <div class="chart-container">
          <canvas id="workerDetailFreqChart"></canvas>
        </div>
      </div>
      <div class="chart-card">
        <h3> Tendencia Diaria</h3>
        <div class="chart-container">
          <canvas id="workerDetailTrendChart"></canvas>
        </div>
      </div>
    </div>

    <div class="chart-card sessions-table-card">
      <h3> Últimas Sesiones</h3>
      <div class="sessions-table-container">
        <table class="sessions-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Duración</th>
              <th>Alertas</th>
              <th>Somnolencia</th>
              <th>Distracción</th>
              <th>Bostezos</th>
            </tr>
          </thead>
          <tbody id="workerDetailSessionsBody">
            ${sessions.length === 0
      ? '<tr><td colspan="6" class="table-empty">No hay sesiones</td></tr>'
      : sessions.slice(0, 10).map(s => {
        const date = new Date(s.started_at);
        const dateStr = date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) +
          ' ' + date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        const dur = s.duration_seconds || 0;
        const durStr = `${Math.floor(dur / 60)}m ${String(dur % 60).padStart(2, '0')}s`;
        return `<tr>
                    <td>${dateStr}</td>
                    <td>${durStr}</td>
                    <td><span class="badge total">${s.total_alerts || 0}</span></td>
                    <td><span class="badge drowsy">${s.total_drowsy || 0}</span></td>
                    <td><span class="badge distracted">${s.total_distracted || 0}</span></td>
                    <td><span class="badge yawn">${s.total_yawns || 0}</span></td>
                  </tr>`;
      }).join('')
    }
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Render charts after DOM is ready
  requestAnimationFrame(() => {
    renderWorkerDetailFreqChart(events);
    renderWorkerDetailTrendChart(events, days);
  });
}

function renderWorkerDetailFreqChart(events) {
  const counts = { drowsy: 0, sleeping: 0, distracted: 0, yawn: 0 };
  events.forEach(e => { if (counts[e.type] !== undefined) counts[e.type]++; });

  destroyChart('workerFreq');
  const ctx = document.getElementById('workerDetailFreqChart');
  if (!ctx) return;

  charts.workerFreq = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Somnolencia', 'Dormido', 'Distracción', 'Bostezos'],
      datasets: [{
        label: 'Eventos',
        data: [counts.drowsy, counts.sleeping, counts.distracted, counts.yawn],
        backgroundColor: [CHART_COLORS.drowsy.bg, CHART_COLORS.sleeping.bg, CHART_COLORS.distracted.bg, CHART_COLORS.yawn.bg],
        borderColor: [CHART_COLORS.drowsy.border, CHART_COLORS.sleeping.border, CHART_COLORS.distracted.border, CHART_COLORS.yawn.border],
        borderWidth: 2,
        borderRadius: 8,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      plugins: { ...CHART_DEFAULTS.plugins, legend: { display: false } },
    },
  });
}

function renderWorkerDetailTrendChart(events, days) {
  const dayMap = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    dayMap[key] = { drowsy: 0, sleeping: 0, distracted: 0, yawn: 0 };
  }

  events.forEach(e => {
    const key = e.timestamp.split('T')[0];
    if (dayMap[key] && dayMap[key][e.type] !== undefined) {
      dayMap[key][e.type]++;
    }
  });

  const labels = Object.keys(dayMap).map(d => {
    const date = new Date(d + 'T12:00:00');
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
  });

  destroyChart('workerTrend');
  const ctx = document.getElementById('workerDetailTrendChart');
  if (!ctx) return;

  charts.workerTrend = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Somnolencia',
          data: Object.values(dayMap).map(d => d.drowsy + d.sleeping),
          borderColor: CHART_COLORS.drowsy.border,
          backgroundColor: 'rgba(234, 179, 8, 0.1)',
          tension: 0.4, fill: true,
        },
        {
          label: 'Distracción',
          data: Object.values(dayMap).map(d => d.distracted),
          borderColor: CHART_COLORS.distracted.border,
          backgroundColor: 'rgba(249, 115, 22, 0.1)',
          tension: 0.4, fill: true,
        },
      ],
    },
    options: CHART_DEFAULTS,
  });
}

/**
 * Setup supervisor event listeners (date filter, modal close).
 */
export function setupSupervisorListeners() {
  // Date filter
  document.getElementById('supervisorDateFilter')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    document.querySelectorAll('#supervisorDateFilter .filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const days = parseInt(btn.dataset.days) || 7;
    renderSupervisorDashboard(days);
  });

  // Worker detail modal close
  const modal = document.getElementById('workerDetailModal');
  const closeBtn = document.getElementById('closeWorkerDetailModal');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => { modal?.classList.remove('active'); currentWorkerId = null; });
  }
  if (modal) {
    modal.addEventListener('click', (e) => { if (e.target === modal) { modal.classList.remove('active'); currentWorkerId = null; } });
  }
}
