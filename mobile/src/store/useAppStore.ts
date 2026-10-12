/**
 * Global Zustand store — app-wide state for auth, screening role, and sync status.
 */
import { create } from 'zustand';
import {
  AuthAPI,
  clearTokens,
  getAccessToken,
  storeTokens,
} from '@services/ApiService';

interface UserProfile {
  id: string;
  email: string;
  display_name: string | null;
  is_admin: boolean;
  is_pro?: boolean;
  subscription_tier?: string;
}

interface AppState {
  // Auth
  isAuthenticated: boolean;
  user: UserProfile | null;
  authLoading: boolean;

  // Screening role
  hasScreeningRole: boolean;
  isScreeningPaused: boolean;

  // Sync
  lastSyncAt: Date | null;
  syncDeltasCount: number;
  isSyncing: boolean;

  // Actions
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<void>;
  setScreeningRole: (granted: boolean) => void;
  setScreeningPaused: (paused: boolean) => void;
  setSyncStatus: (status: { lastSyncAt?: Date; deltasCount?: number; syncing?: boolean }) => void;
}

import { syncBlockListsWithCloud } from '@services/DatabaseService';

export const useAppStore = create<AppState>((set, get) => ({
  isAuthenticated: false,
  user: null,
  authLoading: true,
  hasScreeningRole: false,
  isScreeningPaused: false,
  lastSyncAt: null,
  syncDeltasCount: 0,
  isSyncing: false,

  login: async (email, password) => {
    const resp = await AuthAPI.login(email, password);
    await storeTokens(resp.data.access_token, resp.data.refresh_token);
    const me = await AuthAPI.me();
    set({ isAuthenticated: true, user: me.data });
    try {
      await syncBlockListsWithCloud();
    } catch (e) {
      console.warn('Initial cloud blocklist sync error:', e);
    }
  },

  register: async (email, password, name) => {
    const resp = await AuthAPI.register(email, password, name);
    await storeTokens(resp.data.access_token, resp.data.refresh_token);
    const me = await AuthAPI.me();
    set({ isAuthenticated: true, user: me.data });
    try {
      await syncBlockListsWithCloud();
    } catch (e) {
      console.warn('Initial cloud blocklist sync error:', e);
    }
  },

  logout: async () => {
    await clearTokens();
    set({ isAuthenticated: false, user: null });
  },

  restoreSession: async () => {
    set({ authLoading: true });
    try {
      const token = await getAccessToken();
      if (token) {
        const me = await AuthAPI.me();
        set({ isAuthenticated: true, user: me.data });
        syncBlockListsWithCloud().catch(() => {});
      }
    } catch {
      await clearTokens();
    } finally {
      set({ authLoading: false });
    }
  },

  setScreeningRole: (granted) => set({ hasScreeningRole: granted }),
  setScreeningPaused: (paused) => set({ isScreeningPaused: paused }),

  setSyncStatus: ({ lastSyncAt, deltasCount, syncing }) =>
    set(state => ({
      lastSyncAt: lastSyncAt ?? state.lastSyncAt,
      syncDeltasCount: deltasCount !== undefined ? state.syncDeltasCount + deltasCount : state.syncDeltasCount,
      isSyncing: syncing !== undefined ? syncing : state.isSyncing,
    })),
}));
