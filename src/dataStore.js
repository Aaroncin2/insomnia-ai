/**
 * Data Store Module
 * Records detection sessions and events to Supabase PostgreSQL.
 * Uses a local buffer that flushes periodically for performance.
 * Includes supervisor/admin functions for querying workers' data.
 */
import { supabase } from './supabaseClient.js';

let currentSession = null;
let eventBuffer = [];
let flushInterval = null;
const FLUSH_INTERVAL_MS = 5000;

/**
 * Start a new detection session for the current user.
 */
export async function startSession() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No authenticated user');

  const { data, error } = await supabase
    .from('sessions')
    .insert({ user_id: user.id, started_at: new Date().toISOString() })
    .select()
    .single();

  if (error) {
    console.error('Error starting session:', error);
    throw error;
  }

  currentSession = data;
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
    user_id: currentSession.user_id,
    type,
    timestamp: new Date().toISOString(),
    data,
  });
}

/**
 * Flush the event buffer to Supabase.
 */
async function flushEvents() {
  if (eventBuffer.length === 0) return;

  const toFlush = [...eventBuffer];
  eventBuffer = [];

  const { error } = await supabase.from('events').insert(toFlush);
  if (error) {
    console.error('Error flushing events:', error);
    // Put back on failure
    eventBuffer.unshift(...toFlush);
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

  // Count events for session summary
  const counts = await getSessionCounts(currentSession.id);

  const started = new Date(currentSession.started_at);
  const durationSeconds = Math.floor((Date.now() - started.getTime()) / 1000);

  await supabase
    .from('sessions')
    .update({
      ended_at: new Date().toISOString(),
      total_alerts: counts.total,
      total_drowsy: counts.drowsy,
      total_distracted: counts.distracted,
      total_yawns: counts.yawns,
      duration_seconds: durationSeconds,
    })
    .eq('id', currentSession.id);

  currentSession = null;
}

/**
 * Get event counts for a session.
 */
async function getSessionCounts(sessionId) {
  const { count: total } = await supabase
    .from('events')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', sessionId);

  const { count: drowsy } = await supabase
    .from('events')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .in('type', ['drowsy', 'sleeping']);

  const { count: distracted } = await supabase
    .from('events')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .eq('type', 'distracted');

  const { count: yawns } = await supabase
    .from('events')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .eq('type', 'yawn');

  return {
    total: total || 0,
    drowsy: drowsy || 0,
    distracted: distracted || 0,
    yawns: yawns || 0,
  };
}

/**
 * Get user's sessions within a date range.
 */
export async function getUserSessions(days = 30) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const from = new Date();
  from.setDate(from.getDate() - days);

  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('user_id', user.id)
    .gte('started_at', from.toISOString())
    .not('ended_at', 'is', null)
    .order('started_at', { ascending: false });

  if (error) {
    console.error('Error fetching sessions:', error);
    return [];
  }
  return data || [];
}

/**
 * Get user's events within a date range.
 */
export async function getUserEvents(days = 30) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const from = new Date();
  from.setDate(from.getDate() - days);

  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('user_id', user.id)
    .gte('timestamp', from.toISOString())
    .order('timestamp', { ascending: true });

  if (error) {
    console.error('Error fetching events:', error);
    return [];
  }
  return data || [];
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('groups')
    .select('*')
    .eq('supervisor_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching supervisor groups:', error);
    return [];
  }
  return data || [];
}

/**
 * Get members of a group with their profiles.
 */
export async function getGroupMembers(groupId) {
  const { data: members, error } = await supabase
    .from('group_members')
    .select('user_id, joined_at')
    .eq('group_id', groupId)
    .order('joined_at', { ascending: true });

  if (error) {
    console.error('Error fetching group members:', error);
    return [];
  }

  if (!members || members.length === 0) return [];

  // Fetch profiles separately
  const userIds = members.map(m => m.user_id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .in('id', userIds);

  const profilesMap = {};
  if (profiles) {
    profiles.forEach(p => { profilesMap[p.id] = p; });
  }

  return members.map(m => ({
    ...m,
    profiles: profilesMap[m.user_id] || { id: m.user_id, full_name: 'Sin nombre', role: 'worker' },
  }));
}

/**
 * Get sessions of a specific worker within a date range.
 * Used by supervisors/admins.
 */
export async function getWorkerSessions(workerId, days = 30) {
  const from = new Date();
  from.setDate(from.getDate() - days);

  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('user_id', workerId)
    .gte('started_at', from.toISOString())
    .not('ended_at', 'is', null)
    .order('started_at', { ascending: false });

  if (error) {
    console.error('Error fetching worker sessions:', error);
    return [];
  }
  return data || [];
}

/**
 * Get events of a specific worker within a date range.
 * Used by supervisors/admins.
 */
export async function getWorkerEvents(workerId, days = 30) {
  const from = new Date();
  from.setDate(from.getDate() - days);

  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('user_id', workerId)
    .gte('timestamp', from.toISOString())
    .order('timestamp', { ascending: true });

  if (error) {
    console.error('Error fetching worker events:', error);
    return [];
  }
  return data || [];
}

/**
 * Get aggregated sessions for all workers in a group.
 */
export async function getGroupSessions(groupId, days = 30) {
  // First get member IDs
  const members = await getGroupMembers(groupId);
  const memberIds = members.map(m => m.user_id);
  if (memberIds.length === 0) return [];

  const from = new Date();
  from.setDate(from.getDate() - days);

  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .in('user_id', memberIds)
    .gte('started_at', from.toISOString())
    .not('ended_at', 'is', null)
    .order('started_at', { ascending: false });

  if (error) {
    console.error('Error fetching group sessions:', error);
    return [];
  }
  return data || [];
}

/**
 * Get aggregated events for all workers in a group.
 */
export async function getGroupEvents(groupId, days = 30) {
  const members = await getGroupMembers(groupId);
  const memberIds = members.map(m => m.user_id);
  if (memberIds.length === 0) return [];

  const from = new Date();
  from.setDate(from.getDate() - days);

  const { data, error } = await supabase
    .from('events')
    .select('*')
    .in('user_id', memberIds)
    .gte('timestamp', from.toISOString())
    .order('timestamp', { ascending: true });

  if (error) {
    console.error('Error fetching group events:', error);
    return [];
  }
  return data || [];
}

// ══════════════════════════════════════════════
//  ADMIN FUNCTIONS
// ══════════════════════════════════════════════

/**
 * Get all user profiles (admin only).
 */
export async function getAllProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching all profiles:', error);
    return [];
  }
  return data || [];
}

/**
 * Update a user's role (admin only).
 */
export async function updateUserRole(userId, newRole) {
  const { data, error } = await supabase
    .from('profiles')
    .update({ role: newRole })
    .eq('id', userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get all groups (admin only).
 */
export async function getAllGroups() {
  const { data: groups, error } = await supabase
    .from('groups')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching all groups:', error);
    return [];
  }

  // Fetch supervisor names from profiles
  const supervisorIds = [...new Set((groups || []).map(g => g.supervisor_id).filter(Boolean))];
  let profilesMap = {};

  if (supervisorIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', supervisorIds);

    if (profiles) {
      profiles.forEach(p => { profilesMap[p.id] = p; });
    }
  }

  // Merge supervisor names into groups
  return (groups || []).map(g => ({
    ...g,
    profiles: profilesMap[g.supervisor_id] || null,
  }));
}

/**
 * Create a new group (admin only).
 */
export async function createGroup(name, supervisorId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No authenticated user');

  const code = generateGroupCode();

  const { data, error } = await supabase
    .from('groups')
    .insert({
      name,
      code,
      supervisor_id: supervisorId || null,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update a group (admin only).
 */
export async function updateGroup(groupId, updates) {
  const { data, error } = await supabase
    .from('groups')
    .update(updates)
    .eq('id', groupId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Delete a group (admin only).
 */
export async function deleteGroup(groupId) {
  const { error } = await supabase
    .from('groups')
    .delete()
    .eq('id', groupId);

  if (error) throw error;
}

/**
 * Remove a worker from a group (admin only).
 */
export async function removeWorkerFromGroup(userId, groupId) {
  const { error } = await supabase
    .from('group_members')
    .delete()
    .eq('user_id', userId)
    .eq('group_id', groupId);

  if (error) throw error;
}

/**
 * Generate a random 8-char group code.
 */
function generateGroupCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
