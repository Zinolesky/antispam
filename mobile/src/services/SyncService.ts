/**
 * SyncService — fetches delta updates from the Go /sync endpoint
 * and applies them to the local SQLite database.
 */
import { AppState, AppStateStatus } from 'react-native';
import { applyDeltas, getLastDeltaId, setLastDeltaId, initDB } from './DatabaseService';
import { apiClient } from './ApiService';

const SYNC_BATCH_SIZE = 10_000;
const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let _syncTimer: ReturnType<typeof setInterval> | null = null;
let _isSyncing = false;

export interface SyncResult {
  deltasApplied: number;
  newCursor: number;
  error?: string;
}

/**
 * Performs a single sync pass: fetches deltas since cursor, applies to SQLite.
 */
export async function syncOnce(): Promise<SyncResult> {
  await initDB();

  if (_isSyncing) {
    return { deltasApplied: 0, newCursor: await getLastDeltaId() };
  }

  _isSyncing = true;
  let deltasApplied = 0;
  let newCursor = 0;

  try {
    const sinceId = await getLastDeltaId();
    newCursor = sinceId;

    // Stream NDJSON from Go sync service
    const response = await apiClient.get<string>('/sync', {
      params: { since: sinceId, limit: SYNC_BATCH_SIZE },
      responseType: 'text',
      headers: { Accept: 'application/x-ndjson' },
    });

    const lines = (response.data as string).split('\n').filter(Boolean);
    if (lines.length === 0) {
      return { deltasApplied: 0, newCursor: sinceId };
    }

    type Delta = {
      id: number;
      op: 'I' | 'U' | 'D';
      phone_number: string;
      spam_score?: number | null;
      category?: string | null;
      is_active?: boolean | null;
    };

    const deltas: Delta[] = lines.map(line => JSON.parse(line) as Delta);
    await applyDeltas(deltas);
    deltasApplied = deltas.length;

    // Update cursor to last processed id
    const lastId = deltas[deltas.length - 1]?.id;
    if (lastId) {
      newCursor = lastId;
      await setLastDeltaId(lastId);
    }

    console.log(`[SyncService] Applied ${deltasApplied} deltas, cursor: ${newCursor}`);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown sync error';
    console.warn('[SyncService] Sync failed:', msg);
    return { deltasApplied, newCursor, error: msg };
  } finally {
    _isSyncing = false;
  }

  return { deltasApplied, newCursor };
}

/**
 * Starts periodic sync and syncs on app foreground transitions.
 * Call from App.tsx after initDB().
 */
export function startSyncScheduler(): () => void {
  // Initial sync
  syncOnce().catch(err => console.warn('[SyncService]', err));

  // Periodic interval
  _syncTimer = setInterval(() => {
    syncOnce().catch(err => console.warn('[SyncService]', err));
  }, SYNC_INTERVAL_MS);

  // Sync when app returns to foreground
  const subscription = AppState.addEventListener(
    'change',
    (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        syncOnce().catch(console.error);
      }
    },
  );

  // Cleanup function
  return () => {
    if (_syncTimer) {
      clearInterval(_syncTimer);
      _syncTimer = null;
    }
    subscription.remove();
  };
}
