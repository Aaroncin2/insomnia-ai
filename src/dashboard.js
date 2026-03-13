/**
 * Dashboard Module
 * Renders analytics charts and KPIs using Chart.js + Supabase data.
 */
import Chart from 'chart.js/auto';
import { getUserSessions, getUserEvents } from './dataStore.js';

let charts = {};

/**
 * Render the full dashboard for a given date range.
 */
export async function renderDashboard(days = 7) {
  const loadingEl = document.getElementById('dashboardLoading');
  const contentEl = document.getElementById('dashboardContent');

  if (loadingEl) loadingEl.style.display = 'flex';
  if (contentEl) contentEl.style.opacity = '0.4';

  try {
    const [sessions, events] = await Promise.all([
      getUserSessions(days),
      getUserEvents(days),
    ]);

    renderKPIs(sessions, events);
    renderFrequencyChart(events);
    renderTrendChart(events, days);
    renderDistributionChart(events);
    renderSessionChart(sessions);
    renderSessionsTable(sessions);
  } catch (err) {
    console.error('Dashboard render error:', err);
  } finally {
    if (loadingEl) loadingEl.style.display = 'none';
    if (contentEl) contentEl.style.opacity = '1';
  }
}

// ── KPIs ────────────────────────────────────────────

function renderKPIs(sessions, events) {
  const el = (id) => document.getElementById(id);

  el('kpiTotalAlerts').textContent = events.length;
  el('kpiTotalSessions').textContent = sessions.length;

  const totalSeconds = sessions.reduce((acc, s) => acc + (s.duration_seconds || 0), 0);
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  el('kpiTotalTime').textContent = `${hours}h ${mins}m`;

  const avg = sessions.length > 0 ? (events.length / sessions.length).toFixed(1) : '0';
  el('kpiAvgAlerts').textContent = avg;
}

// ── Charts ──────────────────────────────────────────

const CHART_COLORS = {
  drowsy:     { bg: 'rgba(234, 179, 8, 0.7)',   border: '#eab308' },
  sleeping:   { bg: 'rgba(239, 68, 68, 0.7)',   border: '#ef4444' },
  distracted: { bg: 'rgba(249, 115, 22, 0.7)',  border: '#f97316' },
  yawn:       { bg: 'rgba(139, 92, 246, 0.7)',  border: '#8b5cf6' },
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

function destroyChart(key) {
  if (charts[key]) {
    charts[key].destroy();
    delete charts[key];
  }
}

function renderFrequencyChart(events) {
  const counts = { drowsy: 0, sleeping: 0, distracted: 0, yawn: 0 };
  events.forEach(e => { if (counts[e.type] !== undefined) counts[e.type]++; });

  destroyChart('frequency');
  const ctx = document.getElementById('frequencyChart');
  if (!ctx) return;

  charts.frequency = new Chart(ctx, {
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

function renderTrendChart(events, days) {
  // Group events by day
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

  destroyChart('trend');
  const ctx = document.getElementById('trendChart');
  if (!ctx) return;

  charts.trend = new Chart(ctx, {
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

function renderDistributionChart(events) {
  const counts = { drowsy: 0, sleeping: 0, distracted: 0, yawn: 0 };
  events.forEach(e => { if (counts[e.type] !== undefined) counts[e.type]++; });

  destroyChart('distribution');
  const ctx = document.getElementById('distributionChart');
  if (!ctx) return;

  charts.distribution = new Chart(ctx, {
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

function renderSessionChart(sessions) {
  const recent = sessions.slice(0, 10).reverse();

  destroyChart('sessions');
  const ctx = document.getElementById('sessionChart');
  if (!ctx) return;

  charts.sessions = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: recent.map(s => {
        const d = new Date(s.started_at);
        return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) + ' ' +
               d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
      }),
      datasets: [
        {
          label: 'Somnolencia',
          data: recent.map(s => s.total_drowsy || 0),
          backgroundColor: CHART_COLORS.drowsy.bg,
          borderRadius: 4,
        },
        {
          label: 'Distracción',
          data: recent.map(s => s.total_distracted || 0),
          backgroundColor: CHART_COLORS.distracted.bg,
          borderRadius: 4,
        },
        {
          label: 'Bostezos',
          data: recent.map(s => s.total_yawns || 0),
          backgroundColor: CHART_COLORS.yawn.bg,
          borderRadius: 4,
        },
      ],
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        ...CHART_DEFAULTS.scales,
        x: { ...CHART_DEFAULTS.scales.x, stacked: true },
        y: { ...CHART_DEFAULTS.scales.y, stacked: true },
      },
    },
  });
}

// ── Sessions Table ──────────────────────────────────

function renderSessionsTable(sessions) {
  const tbody = document.getElementById('sessionsTableBody');
  if (!tbody) return;

  if (sessions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="table-empty">No hay sesiones registradas</td></tr>';
    return;
  }

  tbody.innerHTML = sessions.map(s => {
    const date = new Date(s.started_at);
    const dateStr = date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) +
                    ' ' + date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

    const dur = s.duration_seconds || 0;
    const durMin = Math.floor(dur / 60);
    const durSec = dur % 60;
    const durStr = `${durMin}m ${String(durSec).padStart(2, '0')}s`;

    return `<tr>
      <td>${dateStr}</td>
      <td>${durStr}</td>
      <td><span class="badge total">${s.total_alerts || 0}</span></td>
      <td><span class="badge drowsy">${s.total_drowsy || 0}</span></td>
      <td><span class="badge distracted">${s.total_distracted || 0}</span></td>
      <td><span class="badge yawn">${s.total_yawns || 0}</span></td>
    </tr>`;
  }).join('');
}
