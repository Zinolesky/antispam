/**
 * Global Zustand store — app-wide state for auth, screening role, and sync status.
 */
import { create } from 'zustand';
import {
  AuthAPI,
  BlockListAPI,
  clearTokens,
  getAccessToken,
  setOnAuthRevoked,
  storeTokens,
} from '@services/ApiService';
import { setNativeScreeningPaused } from '@services/NativeBridge';
import {
  applyCloudBlocklistDiff,
  CloudBlocklistDiff,
  detectCloudBlocklistDiff,
  keepLocalRulesAndOverwriteCloud,
  syncBlockListsWithCloud,
} from '@services/DatabaseService';

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

  // Cross-device rule sync prompt
  pendingCloudDiff: CloudBlocklistDiff | null;
  cloudNotificationMessage: string | null;

  // Actions
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<void>;
  setScreeningRole: (granted: boolean) => void;
  setScreeningPaused: (paused: boolean) => void;
  setSyncStatus: (status: { lastSyncAt?: Date; deltasCount?: number; syncing?: boolean }) => void;

  // Cross-device sync conflict actions
  checkCloudBlocklistUpdates: () => Promise<void>;
  applyCloudBlocklistChanges: () => Promise<void>;
  dismissCloudBlocklistChanges: () => Promise<void>;
  clearCloudNotification: () => void;
  handleSessionRevoked: (reason?: string) => Promise<void>;
}

let _lastKnownVersion: number | null = null;
let _isCheckingCloudUpdates = false;

export const useAppStore = create<AppState>((set, get) => ({
  isAuthenticated: false,
  user: null,
  authLoading: true,
  hasScreeningRole: false,
  isScreeningPaused: false,
  lastSyncAt: null,
  syncDeltasCount: 0,
  isSyncing: false,
  pendingCloudDiff: null,
  cloudNotificationMessage: null,

  login: async (email, password) => {
    const resp = await AuthAPI.login(email, password);
    await storeTokens(resp.data.access_token, resp.data.refresh_token);
    const me = await AuthAPI.me();
    set({ isAuthenticated: true, user: me.data });
    try {
      await syncBlockListsWithCloud();
      _lastKnownVersion = null;
      await get().checkCloudBlocklistUpdates();
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
      _lastKnownVersion = null;
      await get().checkCloudBlocklistUpdates();
    } catch (e) {
      console.warn('Initial cloud blocklist sync error:', e);
    }
  },

  logout: async () => {
    await clearTokens();
    _lastKnownVersion = null;
    set({ isAuthenticated: false, user: null, pendingCloudDiff: null });
  },

  restoreSession: async () => {
    set({ authLoading: true });
    try {
      const token = await getAccessToken();
      if (token) {
        const me = await AuthAPI.me();
        set({ isAuthenticated: true, user: me.data });
        // Check for cross-device updates right after restoring session
        get().checkCloudBlocklistUpdates().catch(() => {});
      } else {
        set({ isAuthenticated: false, user: null });
      }
    } catch {
      await clearTokens();
      set({ isAuthenticated: false, user: null });
    } finally {
      set({ authLoading: false });
    }
  },

  setScreeningRole: (granted) => set({ hasScreeningRole: granted }),
  setScreeningPaused: (paused) => {
    set({ isScreeningPaused: paused });
    setNativeScreeningPaused(paused);
  },

  setSyncStatus: ({ lastSyncAt, deltasCount, syncing }) =>
    set(state => ({
      lastSyncAt: lastSyncAt ?? state.lastSyncAt,
      syncDeltasCount: deltasCount !== undefined ? state.syncDeltasCount + deltasCount : state.syncDeltasCount,
      isSyncing: syncing !== undefined ? syncing : state.isSyncing,
    })),

  checkCloudBlocklistUpdates: async () => {
    const { isAuthenticated, pendingCloudDiff } = get();
    if (!isAuthenticated || pendingCloudDiff || _isCheckingCloudUpdates) return;

    _isCheckingCloudUpdates = true;
    try {
      // 1. Lightweight remote version check
      const vRes = await BlockListAPI.getVersion();
      const serverVersion = vRes.data?.version ?? 1;

      if (_lastKnownVersion !== null && serverVersion === _lastKnownVersion) {
        return;
      }

      // 2. Compute local vs cloud diff
      const diff = await detectCloudBlocklistDiff();
      if (diff && diff.totalChanges > 0) {
        set({ pendingCloudDiff: diff });
      } else {
        _lastKnownVersion = serverVersion;
      }
    } catch (err: any) {
      // 401s are intercepted by ApiService and trigger handleSessionRevoked
      if (err?.response?.status !== 401) {
        console.warn('[Sync] checkCloudBlocklistUpdates error:', err?.message);
      }
    } finally {
      _isCheckingCloudUpdates = false;
    }
  },

  applyCloudBlocklistChanges: async () => {
    const { pendingCloudDiff } = get();
    if (!pendingCloudDiff) return;

    try {
      await applyCloudBlocklistDiff(pendingCloudDiff);
      _lastKnownVersion = pendingCloudDiff.serverVersion;
      set({ pendingCloudDiff: null });
    } catch (err) {
      console.error('[Sync] Failed to apply cloud diff:', err);
    }
  },

  dismissCloudBlocklistChanges: async () => {
    const { pendingCloudDiff } = get();
    if (!pendingCloudDiff) return;

    try {
      // Keep this device's rules and mirror them to the cloud
      await keepLocalRulesAndOverwriteCloud();
      _lastKnownVersion = pendingCloudDiff.serverVersion;
      set({ pendingCloudDiff: null });
    } catch (err) {
      console.error('[Sync] Failed to keep local rules:', err);
    }
  },

  clearCloudNotification: () => set({ cloudNotificationMessage: null }),

  handleSessionRevoked: async (reason = 'Your cloud session has ended or your account was removed on another device.') => {
    await clearTokens();
    _lastKnownVersion = null;
    set({
      isAuthenticated: false,
      user: null,
      pendingCloudDiff: null,
      cloudNotificationMessage: reason,
    });
  },
}));

// Wire up global auth revocation hook from ApiService
setOnAuthRevoked((reason) => {
  useAppStore.getState().handleSessionRevoked(reason);
});
