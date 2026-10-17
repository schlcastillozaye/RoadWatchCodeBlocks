/**
 * RoadWatch API client — a plain-JavaScript port of the React app's ApiClient.
 *
 * Talks to the shared PHP REST API using the exact same routes and JSON
 * contract. Access/refresh tokens are kept in localStorage; a 401 triggers a
 * single refresh attempt and a retry (refresh tokens rotate on each use).
 */

const ACCESS_KEY = 'rw_web_access_token';
const REFRESH_KEY = 'rw_web_refresh_token';

export class ApiError extends Error {
  constructor(message, code = 'UNKNOWN', status, details) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  get isUnauthorized() {
    return this.status === 401;
  }

  get isForbidden() {
    return this.status === 403;
  }

  get isNetwork() {
    return this.code === 'NETWORK';
  }
}

function buildQuery(query) {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

class ApiClient {
  constructor() {
    this.accessToken = localStorage.getItem(ACCESS_KEY);
    this.refreshToken = localStorage.getItem(REFRESH_KEY);
    this.refreshInFlight = null;
    /** Called when the session can no longer be recovered. */
    this.onSessionExpired = null;
  }

  get baseUrl() {
    return window.RW_API_BASE || window.location.origin;
  }

  get hasSession() {
    return Boolean(this.accessToken);
  }

  /** Authorization header for non-public asset requests (e.g. pending photos). */
  authHeader() {
    return this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {};
  }

  setSession(accessToken, refreshToken) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    localStorage.setItem(ACCESS_KEY, accessToken);
    localStorage.setItem(REFRESH_KEY, refreshToken);
  }

  clearSession() {
    this.accessToken = null;
    this.refreshToken = null;
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  }

  // ---------------------------------------------------------------- transport

  async raw(path, init = {}, withAuth = true) {
    const headers = new Headers(init.headers || {});
    headers.set('Accept', 'application/json');
    if (withAuth && this.accessToken) {
      headers.set('Authorization', `Bearer ${this.accessToken}`);
    }

    try {
      return await fetch(`${this.baseUrl}${path}`, { ...init, headers });
    } catch {
      throw new ApiError('Cannot reach the server. Check your connection and try again.', 'NETWORK');
    }
  }

  async parse(response) {
    let body = null;
    const text = await response.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }

    if (response.ok) return body;

    const errorBody = body && body.error;
    throw new ApiError(
      (errorBody && errorBody.message) || `Request failed (${response.status}).`,
      (errorBody && errorBody.code) || `HTTP_${response.status}`,
      response.status,
      errorBody && errorBody.details,
    );
  }

  async request(path, init = {}, withAuth = true, retry = true) {
    let response = await this.raw(path, init, withAuth);

    if (response.status === 401 && withAuth && retry && this.refreshToken) {
      const refreshed = await this.tryRefresh();
      if (refreshed) {
        response = await this.raw(path, init, withAuth);
      } else {
        this.clearSession();
        if (this.onSessionExpired) this.onSessionExpired();
      }
    }

    return this.parse(response);
  }

  async tryRefresh() {
    if (this.refreshInFlight) return this.refreshInFlight;

    this.refreshInFlight = (async () => {
      try {
        const response = await this.raw(
          '/api/auth/refresh',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: this.refreshToken }),
          },
          false,
        );
        if (!response.ok) return false;
        const session = await response.json();
        this.setSession(session.accessToken, session.refreshToken);
        return true;
      } catch {
        return false;
      } finally {
        this.refreshInFlight = null;
      }
    })();

    return this.refreshInFlight;
  }

  json(path, method, body, withAuth = true) {
    return this.request(
      path,
      {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      },
      withAuth,
    );
  }

  // -------------------------------------------------------------------- auth

  async login(email, password) {
    const session = await this.json('/api/auth/login', 'POST', { email, password }, false);
    this.setSession(session.accessToken, session.refreshToken);
    return session;
  }

  async register(input) {
    const session = await this.json('/api/auth/register', 'POST', input, false);
    this.setSession(session.accessToken, session.refreshToken);
    return session;
  }

  async me() {
    const result = await this.request('/api/auth/me');
    return result.user;
  }

  async logout() {
    if (this.refreshToken) {
      try {
        await this.json('/api/auth/logout', 'POST', { refreshToken: this.refreshToken }, false);
      } catch {
        // Best-effort; always clear locally.
      }
    }
    this.clearSession();
  }

  // ----------------------------------------------------------------- reports

  listReports(query = {}) {
    return this.request(`/api/reports${buildQuery(query)}`);
  }

  getReport(id) {
    return this.request(`/api/reports/${id}`).then((r) => r.report);
  }

  getHistory(id) {
    return this.request(`/api/reports/${id}/history`).then((r) => r.history);
  }

  getStatistics() {
    return this.request('/api/analytics/summary');
  }

  getAuditLogs(limit = 100) {
    return this.request(`/api/analytics/audit-logs${buildQuery({ limit })}`).then((r) => r.logs);
  }

  moderate(id, input) {
    return this.json(`/api/reports/${id}/moderation`, 'PATCH', input).then((r) => r.report);
  }

  assign(id, input) {
    return this.json(`/api/reports/${id}/assign`, 'POST', input).then((r) => r.report);
  }

  /**
   * Uploads any attached photos first (multipart, dedicated endpoint), then
   * applies the repair update as JSON — mirrors the React app and what
   * maintenance staff do in the field.
   */
  async updateRepair(id, input) {
    const { photos, ...fields } = input;

    if (photos && photos.length > 0) {
      const kind = fields.repairStatus === 'COMPLETED' ? 'AFTER' : 'PROGRESS';
      const form = new FormData();
      form.set('kind', kind);
      const fieldName = kind === 'AFTER' ? 'afterPhotos' : 'progressPhotos';
      for (const file of photos) form.append(fieldName, file);
      await this.request(`/api/reports/${id}/photos`, { method: 'POST', body: form });
    }

    return this.json(`/api/reports/${id}/repair`, 'PATCH', fields).then((r) => r.report);
  }

  // -------------------------------------------------------------- maintenance

  listAssignments(query = {}) {
    return this.request(`/api/maintenance/assignments${buildQuery(query)}`);
  }

  officerSummary() {
    return this.request('/api/maintenance/summary');
  }

  // -------------------------------------------------------------------- users

  listOfficers() {
    return this.request('/api/users/officers').then((r) => r.officers);
  }

  listUsers(query = {}) {
    return this.request(`/api/users${buildQuery(query)}`);
  }

  createUser(input) {
    return this.json('/api/users', 'POST', input).then((r) => r.user);
  }

  updateUser(id, input) {
    return this.json(`/api/users/${id}`, 'PATCH', input).then((r) => r.user);
  }

  updateProfile(input) {
    return this.json('/api/users/me', 'PATCH', input).then((r) => r.user);
  }

  resetPassword(id, newPassword) {
    return this.json(`/api/users/${id}/reset-password`, 'POST', { newPassword });
  }

  changePassword(input) {
    return this.json('/api/users/me/password', 'POST', input);
  }

  // ---------------------------------------------------------------------- map

  publicReports(query = {}) {
    return this.request(`/api/map/reports${buildQuery(query)}`);
  }

  publicReport(id) {
    return this.request(`/api/map/reports/${id}`).then((r) => r.report);
  }

  /**
   * Forward geocoding (place / address search). Optional feature: the server
   * answers `available: false` with a reason when no key is configured, so
   * callers can degrade to text filtering.
   */
  searchPlace(query) {
    return this.request(`/api/map/geocode/search${buildQuery({ q: query })}`, {}, false);
  }

  reverseGeocode(lat, lng) {
    return this.request(`/api/map/geocode/reverse${buildQuery({ lat, lng })}`, {}, false);
  }

  /** Creates a report (multipart) — used by the web citizen form. */
  createReport(fields, photos) {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      if (value) form.set(key, value);
    }
    for (const photo of photos) form.append('photos', photo);
    return this.request('/api/reports', { method: 'POST', body: form }).then((r) => r.report);
  }
}

export const api = new ApiClient();
export { buildQuery };
