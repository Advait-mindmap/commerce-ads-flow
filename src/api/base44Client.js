const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

const jsonHeaders = {
  'Content-Type': 'application/json',
};

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...jsonHeaders,
      ...(options.headers || {}),
    },
    credentials: 'include',
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = payload?.error || payload?.message || 'Request failed';
    throw new Error(message);
  }

  return payload;
}

const entities = {
  list: async (entity) => request(`/${encodeURIComponent(entity)}`),
  get: async (entity, id) => request(`/${encodeURIComponent(entity)}/${encodeURIComponent(id)}`),
  filter: async (entity, query = {}) => request(`/${encodeURIComponent(entity)}/query`, {
    method: 'POST',
    body: JSON.stringify(query),
  }),
  create: async (entity, data) => request(`/${encodeURIComponent(entity)}`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  update: async (entity, id, data) => request(`/${encodeURIComponent(entity)}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
  bulkUpdate: async (entity, items = []) => request(`/${encodeURIComponent(entity)}/bulk`, {
    method: 'POST',
    body: JSON.stringify(items),
  }),
};

const auth = {
  me: async () => request('/auth/me'),
  logout: async () => request('/auth/logout', { method: 'POST' }),
  isAuthenticated: async () => request('/auth/me').then(Boolean).catch(() => false),
};

const functions = {
  invoke: async (name, body = {}) => request(`/functions/${encodeURIComponent(name)}`, {
    method: 'POST',
    body: JSON.stringify(body),
  }),
};

export const base44 = {
  entities,
  auth,
  functions,
};
