import { createSignal } from 'solid-js';
import { api, post } from '../services/api';
export const [user, setUser] = createSignal();
export const [authReady, setAuthReady] = createSignal(false);
export async function refreshAuth() {
  try {
    const data = await api('/auth/me');
    setUser(data.user);
  } finally {
    setAuthReady(true);
  }
}
export async function login(body) {
  const data = await post('/auth/login', body);
  setUser(data.user);
  return data.user;
}
export async function logout() {
  await post('/auth/logout');
  setUser(null);
}
