import { API_BASE_URL } from './config';
import type {
  AuditLog,
  AuthSession,
  IssueCategory,
  Officer,
  OfficerNotification,
  Paginated,
  PlaceSearchResponse,
  Priority,
  PublicMapReport,
  Report,
  ReportQuery,
  RepairStatus,
  Role,
  Statistics,
  StatusHistoryEntry,
  User,
} from './types';

const ACCESS_KEY = 'rw_web_access_token';
const REFRESH_KEY = 'rw_web_refresh_token';

export class ApiError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly details?: unknown;

  constructor(message: string, code = 'UNKNOWN', status?: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isNetwork(): boolean {
    return this.code === 'NETWORK';
  }
}

function buildQuery(query?: Record<string, unknown>): string {
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
  private accessToken: string | null = localStorage.getItem(ACCESS_KEY);
  private refreshToken: string | null = localStorage.getItem(REFRESH_KEY);
  private refreshInFlight: Promise<boolean> | null = null;

  /** Called when the session can no longer be recovered. */
  onSessionExpired: (() => void) | null = null;

  get hasSession(): boolean {
    return Boolean(this.accessToken);
  }

  /** Authorization header for non-public asset requests (e.g. pending photos). */
  authHeader(): Record<string, string> {
    return this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {};
  }

  setSession(accessToken: string, refreshToken: string): void {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    localStorage.setItem(ACCESS_KEY, accessToken);
    localStorage.setItem(REFRESH_KEY, refreshToken);
  }

  clearSession(): void {
    this.accessToken = null;
    this.refreshToken = null;
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  }

  // ---------------------------------------------------------------- transport

  private async raw(path: string, init: RequestInit = {}, withAuth = true): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    if (withAuth && this.accessToken) {
      headers.set('Authorization', `Bearer ${this.accessToken}`);
    }

    try {
      return await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
    } catch {
      throw new ApiError('Cannot reach the server. Check your connection and try again.', 'NETWORK');
    }
  }

  private async parse<T>(response: Response): Promise<T> {
    let body: unknown = null;
    const text = await response.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }

    if (response.ok) return body as T;

    const errorBody = (body as { error?: { message?: string; code?: string; details?: unknown } } | null)?.error;
    throw new ApiError(
      errorBody?.message ?? `Request failed (${response.status}).`,
      errorBody?.code ?? `HTTP_${response.status}`,
      response.status,
      errorBody?.details,
    );
  }

  private async request<T>(path: string, init: RequestInit = {}, withAuth = true, retry = true): Promise<T> {
    let response = await this.raw(path, init, withAuth);

    if (response.status === 401 && withAuth && retry && this.refreshToken) {
      const refreshed = await this.tryRefresh();
      if (refreshed) {
        response = await this.raw(path, init, withAuth);
      } else {
        this.clearSession();
        this.onSessionExpired?.();
      }
    }

    return this.parse<T>(response);
  }

  private async tryRefresh(): Promise<boolean> {
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
        const session = (await response.json()) as AuthSession;
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

  private json<T>(path: string, method: string, body?: unknown, withAuth = true): Promise<T> {
    return this.request<T>(
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

  async login(email: string, password: string): Promise<AuthSession> {
    const session = await this.json<AuthSession>('/api/auth/login', 'POST', { email, password }, false);
    this.setSession(session.accessToken, session.refreshToken);
    return session;
  }

  async register(input: {
    fullName: string;
    email: string;
    password: string;
    phone?: string;
  }): Promise<AuthSession> {
    const session = await this.json<AuthSession>('/api/auth/register', 'POST', input, false);
    this.setSession(session.accessToken, session.refreshToken);
    return session;
  }

  async me(): Promise<User> {
    const result = await this.request<{ user: User }>('/api/auth/me');
    return result.user;
  }

  async logout(): Promise<void> {
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

  listReports(query: ReportQuery = {}): Promise<Paginated<Report>> {
    return this.request<Paginated<Report>>(`/api/reports${buildQuery(query as Record<string, unknown>)}`);
  }

  getReport(id: string): Promise<Report> {
    return this.request<{ report: Report }>(`/api/reports/${id}`).then((r) => r.report);
  }

  getHistory(id: string): Promise<StatusHistoryEntry[]> {
    return this.request<{ history: StatusHistoryEntry[] }>(`/api/reports/${id}/history`).then((r) => r.history);
  }

  getStatistics(): Promise<Statistics> {
    return this.request<Statistics>('/api/analytics/summary');
  }

  getAuditLogs(limit = 100): Promise<AuditLog[]> {
    return this.request<{ logs: AuditLog[] }>(`/api/analytics/audit-logs${buildQuery({ limit })}`).then((r) => r.logs);
  }

  moderate(
    id: string,
    input: { decision: 'APPROVE' | 'REJECT'; reason?: string; priority?: Priority },
  ): Promise<Report> {
    return this.json<{ report: Report }>(`/api/reports/${id}/moderation`, 'PATCH', input).then((r) => r.report);
  }

  assign(
    id: string,
    input: { officerId: string; priority?: Priority; note?: string; dueDate?: string },
  ): Promise<Report> {
    return this.json<{ report: Report }>(`/api/reports/${id}/assign`, 'POST', input).then((r) => r.report);
  }

  /**
   * Uploads any attached photos first (multipart, dedicated endpoint), then
   * applies the repair update as JSON. Mirrors what maintenance staff do in the
   * field: photograph the work, then record the status change.
   */
  async updateRepair(
    id: string,
    input: {
      repairStatus?: Exclude<RepairStatus, 'NOT_ASSIGNED'>;
      note?: string;
      completionNotes?: string;
      photos?: File[];
    },
  ): Promise<Report> {
    const { photos, ...fields } = input;

    if (photos && photos.length > 0) {
      const kind = fields.repairStatus === 'AWAITING_VERIFICATION' ? 'AFTER' : 'PROGRESS';
      const form = new FormData();
      form.set('kind', kind);
      const fieldName = kind === 'AFTER' ? 'afterPhotos' : 'progressPhotos';
      for (const file of photos) form.append(fieldName, file);
      await this.request<{ report: Report }>(`/api/reports/${id}/photos`, { method: 'POST', body: form });
    }

    return this.json<{ report: Report }>(`/api/reports/${id}/repair`, 'PATCH', fields).then((r) => r.report);
  }

  // -------------------------------------------------------------- maintenance

  listAssignments(query: ReportQuery = {}): Promise<Paginated<Report>> {
    return this.request<Paginated<Report>>(`/api/maintenance/assignments${buildQuery(query as Record<string, unknown>)}`);
  }

  officerSummary(): Promise<{ assigned: number; awaiting: number; inProgress: number; completed: number }> {
    return this.request('/api/maintenance/summary');
  }

  officerNotifications(): Promise<{ items: OfficerNotification[]; unreadCount: number }> {
    return this.request<{ items: OfficerNotification[]; unreadCount: number }>('/api/maintenance/notifications');
  }

  markOfficerNotificationRead(id: string): Promise<{ items: OfficerNotification[]; unreadCount: number }> {
    return this.json<{ items: OfficerNotification[]; unreadCount: number }>(
      `/api/maintenance/notifications/${encodeURIComponent(id)}/read`,
      'PATCH',
    );
  }

  markAllOfficerNotificationsRead(): Promise<{ items: OfficerNotification[]; unreadCount: number }> {
    return this.json<{ items: OfficerNotification[]; unreadCount: number }>('/api/maintenance/notifications/read-all', 'PATCH');
  }

  // -------------------------------------------------------------------- users

  listOfficers(): Promise<Officer[]> {
    return this.request<{ officers: Officer[] }>('/api/users/officers').then((r) => r.officers);
  }

  listUsers(query: { role?: Role; status?: string; search?: string; page?: number; pageSize?: number } = {}): Promise<
    Paginated<User>
  > {
    return this.request<Paginated<User>>(`/api/users${buildQuery(query as Record<string, unknown>)}`);
  }

  createUser(input: {
    fullName: string;
    email: string;
    password: string;
    role: Role;
    phone?: string;
  }): Promise<User> {
    return this.json<{ user: User }>('/api/users', 'POST', input).then((r) => r.user);
  }

  updateUser(
    id: string,
    input: { fullName?: string; phone?: string; role?: Role; status?: 'ACTIVE' | 'SUSPENDED' },
  ): Promise<User> {
    return this.json<{ user: User }>(`/api/users/${id}`, 'PATCH', input).then((r) => r.user);
  }

  updateProfile(input: { fullName?: string; phone?: string }): Promise<User> {
    return this.json<{ user: User }>('/api/users/me', 'PATCH', input).then((r) => r.user);
  }

  resetPassword(id: string, newPassword: string): Promise<unknown> {
    return this.json(`/api/users/${id}/reset-password`, 'POST', { newPassword });
  }

  changePassword(input: { currentPassword: string; newPassword: string }): Promise<unknown> {
    return this.json('/api/users/me/password', 'POST', input);
  }

  // ---------------------------------------------------------------------- map

  publicReports(
    query: {
      page?: number;
      pageSize?: number;
      category?: IssueCategory;
      repairStatus?: RepairStatus;
      areaLabel?: string;
      search?: string;
      from?: string;
      to?: string;
    } = {},
  ): Promise<Paginated<PublicMapReport>> {
    return this.request<Paginated<PublicMapReport>>(`/api/map/reports${buildQuery(query as Record<string, unknown>)}`);
  }

  publicReport(id: string): Promise<Report> {
    return this.request<{ report: Report }>(`/api/map/reports/${id}`).then((r) => r.report);
  }

  /**
   * Forward geocoding (place / address search). Optional feature: the server
   * answers `available: false` with a reason when no key is configured or
   * Google refuses, so callers can degrade to text filtering.
   */
  searchPlace(query: string): Promise<PlaceSearchResponse> {
    return this.request(`/api/map/geocode/search${buildQuery({ q: query })}`, {}, false);
  }

  reverseGeocode(lat: number, lng: number): Promise<{ available: boolean; address: string | null; areaLabel: string | null }> {
    return this.request(`/api/map/geocode/reverse${buildQuery({ lat, lng })}`, {}, false);
  }

  /** Creates a report (multipart) — used by the web citizen form. */
  createReport(fields: Record<string, string>, photos: File[]): Promise<Report> {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      if (value) form.set(key, value);
    }
    for (const photo of photos) form.append('photos', photo);
    return this.request<{ report: Report }>('/api/reports', { method: 'POST', body: form }).then((r) => r.report);
  }
}

export const api = new ApiClient();
