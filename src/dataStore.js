/**
 * Data Store Module
 * Records detection sessions and events to FastAPI backend.
 * Uses a local buffer that flushes periodically for performance.
 * Includes supervisor/admin functions for querying workers' data.
 */
import { apiFetch } from './auth.js';

let currentSession = null;
let eventBuffer = [];
let flushInterval = null;
const FLUSH_INTERVAL_MS = 5000;

/**
 * Start a new detection session for the current user.
 */
export async function startSession() {
  const res = await apiFetch('/sessions', { method: 'POST' });
  if (!res.ok) throw new Error('Error starting session');

  currentSession = await res.json();
  eventBuffer = [];

  // Periodic flush
  flushInterval = setInterval(flushEvents, FLUSH_INTERVAL_MS);

  return currentSession;
}

/**
 * Record an alert event in the buffer (flushed periodically).
 */
export function recordEvent(type, data = {}) {
  if (!currentSession) return;

  eventBuffer.push({
    session_id: currentSession.id,
    type,
  });
}

/**
 * Flush the event buffer to the backend.
 */
async function flushEvents() {
  if (eventBuffer.length === 0) return;

  const toFlush = [...eventBuffer];
  eventBuffer = [];

  // Send each event to the API
  for (const evt of toFlush) {
    try {
      await apiFetch('/sessions/events', {
        method: 'POST',
        body: JSON.stringify(evt),
      });
    } catch (err) {
      console.error('Error flushing event:', err);
      eventBuffer.push(evt);
    }
  }
}

/**
 * End the current session. Flushes remaining events and updates session summary.
 */
export async function endSession() {
  if (!currentSession) return;

  // Flush remaining
  await flushEvents();

  if (flushInterval) {
    clearInterval(flushInterval);
    flushInterval = null;
  }

  const started = new Date(currentSession.started_at);
  const durationSeconds = Math.floor((Date.now() - started.getTime()) / 1000);

  // We track counts locally for the session end
  const counts = sessionLocalCounts;

  await apiFetch(`/sessions/${currentSession.id}`, {
    method: 'PUT',
    body: JSON.stringify({
      duration_seconds: durationSeconds,
      total_alerts: counts.total,
      total_drowsy: counts.drowsy,
      total_distracted: counts.distracted,
      total_yawns: counts.yawns,
    }),
  });

  currentSession = null;
  resetLocalCounts();
}

// ── Local event counting (to avoid extra API call at session end) ─

let sessionLocalCounts = { total: 0, drowsy: 0, distracted: 0, yawns: 0 };

function resetLocalCounts() {
  sessionLocalCounts = { total: 0, drowsy: 0, distracted: 0, yawns: 0 };
}

/**
 * Override recordEvent to also track local counts.
 */
const _originalRecordEvent = recordEvent;
export { _originalRecordEvent };

export function recordEventAndCount(type, data = {}) {
  recordEvent(type, data);
  sessionLocalCounts.total++;
  if (type === 'drowsy' || type === 'sleeping') sessionLocalCounts.drowsy++;
  if (type === 'distracted') sessionLocalCounts.distracted++;
  if (type === 'yawn') sessionLocalCounts.yawns++;
}

/**
 * Get user's sessions within a date range.
 */
export async function getUserSessions(days = 30) {
  const res = await apiFetch(`/reports/sessions?days=${days}`);
  if (!res.ok) return [];
  return await res.json();
}

/**
 * Get user's events within a date range.
 */
export async function getUserEvents(days = 30) {
  const res = await apiFetch(`/reports/events?days=${days}`);
  if (!res.ok) return [];
  return await res.json();
}

/**
 * Check if a session is currently active.
 */
export function isSessionActive() {
  return currentSession !== null;
}

// ══════════════════════════════════════════════
//  SUPERVISOR / ADMIN FUNCTIONS
// ══════════════════════════════════════════════

/**
 * Get groups supervised by the current user.
 */
export async function getSupervisorGroups() {
  const res = await apiFetch('/groups/supervised');
  if (!res.ok) return [];
  return await res.json();
}

/**
 * Get members of a group with their profiles.
 */
export async function getGroupMembers(groupId) {
  const res = await apiFetch(`/groups/${groupId}/members`);
  if (!res.ok) return [];

  const members = await res.json();
  // Map to the format expected by the frontend (profiles sub-object)
  return members.map(m => ({
    user_id: m.user_id,
    joined_at: m.joined_at,
    profiles: {
      id: m.user_id,
      full_name: m.full_name || 'Sin nombre',
      role: 'worker',
    },
  }));
}

/**
 * Get sessions of a specific worker within a date range.
 */
export async function getWorkerSessions(workerId, days = 30) {
  // Use group sessions endpoint and filter client-side
  // Or we can add a dedicated endpoint later
  const res = await apiFetch(`/reports/sessions?days=${days}`);
  if (!res.ok) return [];
  const sessions = await res.json();
  return sessions.filter(s => s.user_id === workerId);
}

/**
 * Get events of a specific worker within a date range.
 */
export async function getWorkerEvents(workerId, days = 30) {
  const res = await apiFetch(`/reports/events?days=${days}`);
  if (!res.ok) return [];
  const events = await res.json();
  return events.filter(e => e.user_id === workerId);
}

/**
 * Get aggregated sessions for all workers in a group.
 */
export async function getGroupSessions(groupId, days = 30) {
  const res = await apiFetch(`/groups/${groupId}/sessions?days=${days}`);
  if (!res.ok) return [];
  return await res.json();
}

/**
 * Get aggregated events for all workers in a group.
 */
export async function getGroupEvents(groupId, days = 30) {
  const res = await apiFetch(`/groups/${groupId}/events?days=${days}`);
  if (!res.ok) return [];
  return await res.json();
}

// ══════════════════════════════════════════════
//  ADMIN FUNCTIONS
// ══════════════════════════════════════════════

/**
 * Get all user profiles (admin only).
 */
export async function getAllProfiles() {
  const res = await apiFetch('/admin/users');
  if (!res.ok) return [];
  return await res.json();
}

/**
 * Update a user's role (admin only).
 */
export async function updateUserRole(userId, newRole) {
  const res = await apiFetch(`/admin/users/${userId}/role`, {
    method: 'PUT',
    body: JSON.stringify({ role: newRole }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.detail || 'Error updating role');
  }
  return await res.json();
}

/**
 * Get all groups (admin only).
 */
export async function getAllGroups() {
  const res = await apiFetch('/admin/groups');
  if (!res.ok) return [];

  const groups = await res.json();
  // Map to the format expected by adminPanel.js (profiles sub-object for supervisor)
  return groups.map(g => ({
    ...g,
    profiles: g.supervisor_name
      ? { full_name: g.supervisor_name }
      : null,
  }));
}

/**
 * Create a new group (admin only).
 */
export async function createGroup(name, supervisorId) {
  const res = await apiFetch('/admin/groups', {
    method: 'POST',
    body: JSON.stringify({
      name,
      supervisor_id: supervisorId || null,
    }),
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.detail || 'Error creating group');
  }
  return await res.json();
}

/**
 * Update a group (admin only).
 */
export async function updateGroup(groupId, updates) {
  // Not implemented in backend yet — placeholder
  console.warn('updateGroup not yet implemented in API');
}

/**
 * Delete a group (admin only).
 */
export async function deleteGroup(groupId) {
  const res = await apiFetch(`/admin/groups/${groupId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.detail || 'Error deleting group');
  }
}

/**
 * Remove a worker from a group (admin/supervisor).
 */
export async function removeWorkerFromGroup(userId, groupId) {
  const res = await apiFetch(`/groups/${groupId}/members/${userId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.detail || 'Error removing member');
  }
}
