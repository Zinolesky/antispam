/**
 * ApiService — Axios client configured for the AntiSpamApp backend.
 * Routes to the correct service via Nginx (sync/lookup → Go, everything else → FastAPI).
 */
import axios, { AxiosInstance } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = __DEV__
  ? 'http://localhost:8088' // Mapped via `adb reverse tcp:8088 tcp:8088` to Nginx
  : 'https://api.antispamapp.com'; // Production

const LAN_FALLBACK_URL = 'http://192.168.1.4:8088';

// ── Shared client for Go sync endpoints ────────────────────────────────────────
export const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
});

// ── Authenticated client for FastAPI endpoints ─────────────────────────────────
export const authClient: AxiosInstance = axios.create({
  baseURL: `${BASE_URL}/api/v1`,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

// Automatic LAN fallback if USB reverse connection drops
if (__DEV__) {
  const attachLanFallback = (client: AxiosInstance) => {
    client.interceptors.response.use(
      res => res,
      async error => {
        const config = error.config;
        if (!config || config._lanRetried) {
          return Promise.reject(error);
        }
        if (error.message === 'Network Error' || error.code === 'ERR_NETWORK' || !error.response) {
          config._lanRetried = true;
          if (config.baseURL?.includes('localhost:8088')) {
            config.baseURL = config.baseURL.replace('localhost:8088', '192.168.1.4:8088');
            return client(config);
          }
        }
        return Promise.reject(error);
      },
    );
  };
  attachLanFallback(apiClient);
  attachLanFallback(authClient);
}

// ── Token storage keys ─────────────────────────────────────────────────────────
const ACCESS_TOKEN_KEY = '@antispam/access_token';
const REFRESH_TOKEN_KEY = '@antispam/refresh_token';

export async function storeTokens(access: string, refresh: string): Promise<void> {
  await AsyncStorage.multiSet([
    [ACCESS_TOKEN_KEY, access],
    [REFRESH_TOKEN_KEY, refresh],
  ]);
}

export async function getAccessToken(): Promise<string | null> {
  return AsyncStorage.getItem(ACCESS_TOKEN_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return AsyncStorage.getItem(REFRESH_TOKEN_KEY);
}

export async function clearTokens(): Promise<void> {
  await AsyncStorage.multiRemove([ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY]);
}

// ── Auth interceptor: attach Bearer token ─────────────────────────────────────
authClient.interceptors.request.use(async config => {
  const token = await getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Auth interceptor: refresh token on 401 ────────────────────────────────────
let _isRefreshing = false;
let _refreshQueue: Array<(token: string) => void> = [];

authClient.interceptors.response.use(
  res => res,
  async error => {
    const original = error.config;
    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error);
    }

    if (_isRefreshing) {
      return new Promise(resolve => {
        _refreshQueue.push((token: string) => {
          original.headers.Authorization = `Bearer ${token}`;
          resolve(authClient(original));
        });
      });
    }

    original._retry = true;
    _isRefreshing = true;

    try {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) throw new Error('No refresh token');

      const resp = await authClient.post('/auth/refresh', { refresh_token: refreshToken });
      const { access_token, refresh_token: newRefresh } = resp.data;

      await storeTokens(access_token, newRefresh);
      _refreshQueue.forEach(cb => cb(access_token));
      _refreshQueue = [];

      original.headers.Authorization = `Bearer ${access_token}`;
      return authClient(original);
    } catch {
      await clearTokens();
      return Promise.reject(error);
    } finally {
      _isRefreshing = false;
    }
  },
);

// ── Auth API helpers ───────────────────────────────────────────────────────────
export const AuthAPI = {
  register: (email: string, password: string, displayName?: string) =>
    authClient.post('/auth/register', { email, password, display_name: displayName }),

  login: (email: string, password: string) =>
    authClient.post('/auth/login', { email, password }),

  logout: (refreshToken: string) =>
    authClient.post('/auth/logout', { refresh_token: refreshToken }),

  me: () => authClient.get('/auth/me'),

  getGoogleAuthUrl: () => authClient.get<{ auth_url: string }>('/auth/oauth/google?format=json'),
};

export const ReportsAPI = {
  submit: (phoneNumber: string, category: string, notes?: string) =>
    authClient.post('/reports', { phone_number: phoneNumber, category, notes }),

  getForNumber: (phoneNumber: string) =>
    authClient.get(`/reports/${encodeURIComponent(phoneNumber)}`),
};

export const NumbersAPI = {
  check: (number: string) =>
    authClient.get('/numbers/check', { params: { number } }),
};

export const BlockListAPI = {
  sync: (
    numbers: Array<{ phone_number: string; label?: string }>,
    prefixes: Array<{ prefix: string; label?: string }>,
  ) =>
    authClient.post<{
      numbers: Array<{ phone_number: string; label?: string }>;
      prefixes: Array<{ prefix: string; label?: string }>;
    }>('/user/blocklist/sync', { numbers, prefixes }),

  get: () =>
    authClient.get<{
      numbers: Array<{ phone_number: string; label?: string }>;
      prefixes: Array<{ prefix: string; label?: string }>;
    }>('/user/blocklist'),

  addNumber: (phoneNumber: string, label?: string) =>
    authClient.post('/user/blocklist/number', { phone_number: phoneNumber, label }),

  removeNumber: (phoneNumber: string) =>
    authClient.delete(`/user/blocklist/number/${encodeURIComponent(phoneNumber)}`),

  addPrefix: (prefix: string, label?: string) =>
    authClient.post('/user/blocklist/prefix', { prefix, label }),

  removePrefix: (prefix: string) =>
    authClient.delete(`/user/blocklist/prefix/${encodeURIComponent(prefix)}`),
};
