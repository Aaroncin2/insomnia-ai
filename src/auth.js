/**
 * Auth Module
 * Handles user authentication via Supabase Auth (email/password).
 */
import { supabase } from './supabaseClient.js';

/**
 * Register a new user.
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
