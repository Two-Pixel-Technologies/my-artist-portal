'use client';
// Browser-side API client for the admin area and public forms. Same-origin, cookie session.
export class ApiError extends Error {
  status: number;
  data: any;
  constructor(status: number, message: string, data?: any) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export async function request<T = any>(method: string, url: string, body?: unknown): Promise<T> {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: { 'x-requested-with': 'ma-admin', ...(body && !isForm ? { 'content-type': 'application/json' } : {}) },
    body: body ? (isForm ? (body as FormData) : JSON.stringify(body)) : undefined,
  });
  let data: any = null;
  const type = res.headers.get('content-type') || '';
  if (type.includes('application/json')) data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && url.startsWith('/api/admin') && !url.includes('/auth/login') && typeof window !== 'undefined') {
      window.location.href = '/admin/login';
    }
    throw new ApiError(res.status, data?.error || `Request failed (${res.status})`, data);
  }
  return data as T;
}

export const adminApi = {
  get: <T = any>(path: string) => request<T>('GET', `/api/admin${path}`),
  post: <T = any>(path: string, body?: unknown) => request<T>('POST', `/api/admin${path}`, body ?? {}),
  put: <T = any>(path: string, body?: unknown) => request<T>('PUT', `/api/admin${path}`, body ?? {}),
  patch: <T = any>(path: string, body?: unknown) => request<T>('PATCH', `/api/admin${path}`, body ?? {}),
  del: <T = any>(path: string) => request<T>('DELETE', `/api/admin${path}`),
};
