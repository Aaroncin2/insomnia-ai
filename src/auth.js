/**
 * Auth Module
 * Handles user authentication via Supabase Auth (email/password).
 * Includes profile management and group membership.
 */
import { supabase } from './supabaseClient.js';

/**
 * Register a new user. Profile is auto-created by DB trigger with role='worker'.
 */
export async function register(name, email, password) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: name },
    },
  });
  if (error) throw error;
  return data;
}

/**
 * Login with email and password.
 */
export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

/**
 * Logout the current user.
 */
export async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/**
 * Get the currently authenticated user (or null).
 */
export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/**
 * Get the current session.
 */
export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

/**
 * Listen for auth state changes.
 * @param {Function} callback - (event, session) => void
 */
export function onAuthChange(callback) {
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
}

// ── Profile & Roles ─────────────────────────────────

/**
 * Get the current user's profile (role, full_name, etc).
 * @returns {Object|null} profile
 */
export async function getUserProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error) {
    console.error('Error fetching profile:', error);
    return null;
  }
  return data;
}

/**
 * Get a specific user's role.
 * @returns {string} 'worker' | 'supervisor' | 'admin'
 */
export async function getUserRole() {
  const profile = await getUserProfile();
  return profile?.role || 'worker';
}

// ── Group Membership (Workers) ──────────────────────

/**
 * Worker joins a group using an invite code.
 * @param {string} code - The group invite code
 * @returns {Object} The group_members entry
 */
export async function joinGroup(code) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No authenticated user');

  // Find the group by code
  const { data: group, error: groupErr } = await supabase
    .from('groups')
    .select('id, name')
    .eq('code', code.toUpperCase().trim())
    .single();

  if (groupErr || !group) throw new Error('Código de grupo no encontrado');

  // Check if already a member
  const { data: existing } = await supabase
    .from('group_members')
    .select('id')
    .eq('group_id', group.id)
    .eq('user_id', user.id)
    .single();

  if (existing) throw new Error('Ya eres miembro de este grupo');

  // Join
  const { data, error } = await supabase
    .from('group_members')
    .insert({ group_id: group.id, user_id: user.id })
    .select()
    .single();

  if (error) throw error;
  return { ...data, group_name: group.name };
}

/**
 * Worker leaves a group.
 */
export async function leaveGroup(groupId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No authenticated user');

  const { error } = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', user.id);

  if (error) throw error;
}

/**
 * Get groups that the current user belongs to (as a worker).
 */
export async function getMyGroups() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('group_members')
    .select('group_id, joined_at, groups(id, name, code, supervisor_id)')
    .eq('user_id', user.id);

  if (error) {
    console.error('Error fetching my groups:', error);
    return [];
  }
  return data || [];
}
