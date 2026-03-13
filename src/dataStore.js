/**
 * Data Store Module
 * Records detection sessions and events to Supabase PostgreSQL.
 * Uses a local buffer that flushes periodically for performance.
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
