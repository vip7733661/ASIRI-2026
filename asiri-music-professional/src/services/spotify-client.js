import { AppError } from '../core/error-boundary.js';

const API_BASE = 'https://api.spotify.com/v1';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';

export class SpotifyClient {
  constructor({ clientId, storage, eventBus }) {
    this.clientId = clientId;
    this.storage = storage;
    this.eventBus = eventBus;
    this.refreshPromise = null;
  }

  async getAccessToken() {
    const token = this.storage.get('spotify.accessToken');
    const expiresAt = Number(this.storage.get('spotify.expiresAt', 0));
    if (token && Date.now() < expiresAt) return token;
    return this.refreshAccessToken();
  }

  async refreshAccessToken() {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.#refresh().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  async #refresh() {
    const refreshToken = this.storage.get('spotify.refreshToken');
    if (!refreshToken) throw new AppError('AUTH_REQUIRED', 'يلزم تسجيل الدخول إلى Spotify');

    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      this.clearSession();
      throw new AppError('TOKEN_REFRESH_FAILED', 'تعذر تجديد جلسة Spotify', {
        status: response.status,
      });
    }

    const payload = await response.json();
    this.storage.set('spotify.accessToken', payload.access_token);
    this.storage.set('spotify.expiresAt', Date.now() + payload.expires_in * 1000 - 60_000);
    if (payload.refresh_token) this.storage.set('spotify.refreshToken', payload.refresh_token);
    this.eventBus.emit('auth:refreshed');
    return payload.access_token;
  }

  clearSession() {
    ['spotify.accessToken', 'spotify.expiresAt', 'spotify.refreshToken'].forEach(key => this.storage.remove(key));
    this.eventBus.emit('auth:required');
  }

  async request(path, options = {}, retry = true) {
    const token = await this.getAccessToken();
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    });

    if (response.status === 401 && retry) {
      await this.refreshAccessToken();
      return this.request(path, options, false);
    }

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('Retry-After') || 1);
      throw new AppError('RATE_LIMITED', 'Spotify طلب الانتظار مؤقتًا', { retryAfter });
    }

    if (!response.ok) {
      let detail = '';
      try {
        const body = await response.json();
        detail = body?.error?.message || body?.error || '';
      } catch {}
      throw new AppError(`SPOTIFY_${response.status}`, detail || 'تعذر تنفيذ طلب Spotify', {
        status: response.status,
        path,
      });
    }

    if (response.status === 204) return null;
    return response.json();
  }

  get(path) {
    return this.request(path);
  }

  put(path, body) {
    return this.request(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined });
  }

  post(path, body) {
    return this.request(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
  }

  delete(path, body) {
    return this.request(path, { method: 'DELETE', body: body ? JSON.stringify(body) : undefined });
  }
}
