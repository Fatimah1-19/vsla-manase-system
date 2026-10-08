// One place that talks to the backend.
const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const TOKEN_KEY = 'vb_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

// When a token expires mid-use, every screen needs to react the same way.
let onSessionEnd = null;
export const setSessionEndHandler = (fn) => { onSessionEnd = fn; };

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data || {};
  }
}

async function request(method, path, body, { auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Cannot reach the server. Check that the backend is running.', 0);
  }

  // While someone is still working the server hands back a fresh token, so a
  // session never runs out in the middle of use.
  const renewed = res.headers.get('X-Renewed-Token');
  if (auth && renewed) setToken(renewed);

  let data = {};
  const text = await res.text();
  if (text) { try { data = JSON.parse(text); } catch { data = { message: text }; } }

  if (!res.ok) {
    if (res.status === 401 && auth && token && onSessionEnd) {
      onSessionEnd(data.expired ? 'expired' : 'invalid');
    }
    throw new ApiError(data.message || `Request failed (${res.status})`, res.status, data);
  }
  return data;
}

/** Fetch a protected file (a member's document) and hand back a temporary link to it. */
export async function fetchFile(path) {
  const token = getToken();
  const res = await fetch(`${BASE}/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new ApiError('Could not open that file.', res.status);
  return URL.createObjectURL(await res.blob());
}

export const api = {
  get:   (p, o)    => request('GET', p, undefined, o),
  post:  (p, b, o) => request('POST', p, b, o),
  put:   (p, b, o) => request('PUT', p, b, o),
  patch: (p, b, o) => request('PATCH', p, b, o),
  del:   (p, o)    => request('DELETE', p, undefined, o),
};