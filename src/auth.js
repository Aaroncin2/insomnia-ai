/**
 * Auth Module
 * Handles user authentication via FastAPI backend (JWT).
 * Includes profile management and group membership.
 */

const API_URL = 'http://127.0.0.1:8000/api';

// ── Token management ────────────────────────────────

function getToken() {
  return localStorage.getItem('insomnia_token');
}

function setToken(token) {
  localStorage.setItem('insomnia_token', token);
}

function clearToken() {
  localStorage.removeItem('insomnia_token');
  localStorage.removeItem('insomnia_user');
}

function getCachedUser() {
  const raw = localStorage.getItem('insomnia_user');
  return raw ? JSON.parse(raw) : null;
}

function setCachedUser(user) {
  localStorage.setItem('insomnia_user', JSON.stringify(user));
}

/** Helper for authenticated API calls. */
export async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    clearToken();
    window.location.reload();
    throw new Error('Sesión expirada');
  }

  return res;
}

// ── Auth ─────────────────────────────────────────────

/**
 * Register a new user.
 */
export async function register(name, email, password) {
  const res = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, full_name: name }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Error en registro');

  setToken(data.access_token);
  setCachedUser(data.user);
  return data;
}

/**
 * Login with email and password.
 */
export async function login(email, password) {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Credenciales incorrectas');

  setToken(data.access_token);
  setCachedUser(data.user);
  return data;
}

/**
 * Logout the current user.
 */
export async function logout() {
  clearToken();
}

/**
 * Get the currently authenticated user (or null).
 */
export async function getCurrentUser() {
  const token = getToken();
  if (!token) return null;

  try {
    const res = await apiFetch('/auth/me');
    if (!res.ok) {
      clearToken();
      return null;
    }
    const user = await res.json();
    setCachedUser(user);
    return user;
  } catch {
    clearToken();
    return null;
  }
}

/**
 * Get the current session (token check).
 */
export async function getSession() {
  const token = getToken();
  if (!token) return null;
  return { access_token: token };
}

/**
 * Listen for auth state changes.
 * Legacy compatibility stub — no-op.
 * The main.js will call getCurrentUser() on load instead.
 */
export function onAuthChange(callback) {
  // No-op — auth state is checked on page load
  return { data: { subscription: { unsubscribe: () => {} } } };
}

// ── Profile & Roles ─────────────────────────────────

/**
 * Get the current user's profile (role, full_name, etc).
 */
export async function getUserProfile() {
  const user = await getCurrentUser();
  if (!user) return null;
  return {
    id: user.id,
    full_name: user.full_name,
    role: user.role,
    email: user.email,
  };
}

/**
 * Get a specific user's role.
 */
export async function getUserRole() {
  const profile = await getUserProfile();
  return profile?.role || 'worker';
}

// ── Group Membership (Workers) ──────────────────────

/**
 * Worker joins a group using an invite code.
 */
export async function joinGroup(code) {
  const res = await apiFetch('/groups/join', {
    method: 'POST',
    body: JSON.stringify({ code: code.toUpperCase().trim() }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Error al unirse al grupo');
  return data;
}

/**
 * Worker leaves a group.
 */
export async function leaveGroup(groupId) {
  const user = getCachedUser();
  if (!user) throw new Error('No authenticated user');

  const res = await apiFetch(`/groups/${groupId}/members/${user.id}`, {
    method: 'DELETE',
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.detail || 'Error al salir del grupo');
  }
}

/**
 * Get groups that the current user belongs to (as a worker).
 */
export async function getMyGroups() {
  const res = await apiFetch('/groups/my-groups');
  if (!res.ok) return [];

  const groups = await res.json();
  // Map to the format expected by the frontend
  return groups.map(g => ({
    group_id: g.id,
    joined_at: g.created_at,
    groups: { id: g.id, name: g.name, code: g.code, supervisor_id: g.supervisor_id },
  }));
}
