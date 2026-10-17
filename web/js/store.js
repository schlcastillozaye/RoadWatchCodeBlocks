/** Authentication state shared across pages (port of lib/auth.tsx). */

import { api } from './api.js';

const listeners = new Set();

const state = {
  user: null,
  initializing: true,
};

function emit() {
  for (const listener of listeners) listener(state);
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getState() {
  return state;
}

export function isAdmin() {
  return state.user && state.user.role === 'ADMIN';
}

export function isOfficer() {
  return state.user && state.user.role === 'MAINTENANCE_OFFICER';
}

export function isStaff() {
  return isAdmin() || isOfficer();
}

export async function refreshUser() {
  try {
    state.user = await api.me();
  } catch {
    state.user = null;
  }
  emit();
  return state.user;
}

export async function init() {
  api.onSessionExpired = () => {
    state.user = null;
    emit();
  };

  if (api.hasSession) {
    await refreshUser();
  }
  state.initializing = false;
  emit();
}

export async function login(email, password) {
  const session = await api.login(email, password);
  state.user = session.user;
  emit();
  return session.user;
}

export async function logout() {
  await api.logout();
  state.user = null;
  emit();
}
