let csrfToken;
export async function api(path, options = {}) {
  const method = options.method || 'GET';
  if (method !== 'GET' && !csrfToken) {
    const r = await fetch('/api/auth/me', { credentials: 'include' });
    const j = await r.json();
    csrfToken = j.data?.csrfToken;
  }
  const isForm = options.body instanceof FormData;
  const response = await fetch('/api' + path, {
    ...options,
    credentials: 'include',
    headers: {
      ...(isForm ? {} : { 'Content-Type': 'application/json' }),
      ...(method !== 'GET' ? { 'X-CSRF-Token': csrfToken } : {}),
      ...options.headers,
    },
    body: options.body ? (isForm ? options.body : JSON.stringify(options.body)) : undefined,
  });
  const json = await response.json();
  if (!response.ok) {
    const error = new Error(
      json.details?.map((d) => `${d.field}: ${d.message}`).join('\n') ||
        json.error ||
        'Request failed',
    );
    error.status = response.status;
    throw error;
  }
  if (json.data?.csrfToken) csrfToken = json.data.csrfToken;
  if (path === '/auth/logout' || path === '/auth/change-password') csrfToken = undefined;
  return json.data;
}
export const post = (path, body = {}) => api(path, { method: 'POST', body });
export const patch = (path, body) => api(path, { method: 'PATCH', body });
export const put = (path, body) => api(path, { method: 'PUT', body });
export const remove = (path) => api(path, { method: 'DELETE' });
export const query = (values) =>
  '?' +
  new URLSearchParams(Object.entries(values).filter(([, v]) => v !== '' && v != null)).toString();
