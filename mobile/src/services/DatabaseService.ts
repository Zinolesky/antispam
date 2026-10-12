/**
 * DatabaseService — JSI SQLite wrapper for on-device spam data.
 *
 * Schema (on-device):
 *   spam_numbers   — synced from server, used for real-time call screening
 *   user_block_list — personal block list
 *   call_log       — recent screening outcomes
 *   sync_meta      — stores last sync cursor
 */
import SQLite, { SQLiteDatabase, Transaction } from 'react-native-sqlite-storage';

SQLite.enablePromise(true);

export interface SpamEntry {
  phone_number: string;
  spam_score: number;
  category: string;
  is_active: boolean;
}

export interface CallLogEntry {
  id?: number;
  phone_number: string;
  screening_result: 'allowed' | 'silenced' | 'rejected' | 'skipped';
  spam_score: number | null;
  called_at: string; // ISO 8601
}

export interface BlockListEntry {
  phone_number: string;
  label?: string;
}

export interface BlockedPrefixEntry {
  prefix: string;
  label?: string;
}

let _db: SQLiteDatabase | null = null;

const DB_NAME = 'antispam.db';
const DB_VERSION = 1;

let _initPromise: Promise<SQLiteDatabase> | null = null;

export async function initDB(): Promise<SQLiteDatabase> {
  if (_db) return _db;
  if (!_initPromise) {
    _initPromise = (async () => {
      const database = await SQLite.openDatabase({ name: DB_NAME, location: 'default' });
      await database.executeSql('PRAGMA journal_mode=WAL;');
      await database.executeSql('PRAGMA synchronous=NORMAL;');
      await database.executeSql('PRAGMA foreign_keys=ON;');
      await createTables(database);
      _db = database;
      return database;
    })();
  }
  return _initPromise;
}

async function createTables(db: SQLiteDatabase): Promise<void> {
  await db.transaction(async (tx: Transaction) => {
    tx.executeSql(`
      CREATE TABLE IF NOT EXISTS spam_numbers (
        phone_number TEXT PRIMARY KEY,
        spam_score   INTEGER NOT NULL DEFAULT 50,
        category     TEXT NOT NULL DEFAULT 'unknown',
        is_active    INTEGER NOT NULL DEFAULT 1,
        updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    tx.executeSql(`
      CREATE INDEX IF NOT EXISTS idx_spam_numbers_active
        ON spam_numbers(phone_number) WHERE is_active = 1;
    `);

    tx.executeSql(`
      CREATE TABLE IF NOT EXISTS user_block_list (
        phone_number TEXT PRIMARY KEY,
        label        TEXT,
        created_at   TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    tx.executeSql(`
      CREATE TABLE IF NOT EXISTS user_block_prefixes (
        prefix     TEXT PRIMARY KEY,
        label      TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // Seed default telemarketing / robocall prefixes
    tx.executeSql(`
      INSERT OR IGNORE INTO user_block_prefixes(prefix, label)
      VALUES ('0201888', 'Lagos Telemarketing / Robocalls'),
             ('0201700', 'Lagos Telemarketing / Robocalls');
    `);

    // Clean up any legacy entries that had asterisks or wildcards stored
    tx.executeSql(`
      UPDATE user_block_prefixes
      SET prefix = REPLACE(REPLACE(prefix, '*', ''), '#', '')
      WHERE prefix LIKE '%*%' OR prefix LIKE '%#%';
    `);

    tx.executeSql(`
      CREATE TABLE IF NOT EXISTS call_log (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        phone_number     TEXT NOT NULL,
        screening_result TEXT NOT NULL DEFAULT 'allowed',
        spam_score       INTEGER,
        called_at        TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    tx.executeSql(`
      CREATE INDEX IF NOT EXISTS idx_call_log_called_at
        ON call_log(called_at DESC);
    `);

    tx.executeSql(`
      CREATE TABLE IF NOT EXISTS sync_meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    // Initialize sync cursor
    tx.executeSql(`
      INSERT OR IGNORE INTO sync_meta(key, value) VALUES ('last_delta_id', '0');
    `);
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function db(): SQLiteDatabase {
  if (!_db) throw new Error('DatabaseService not initialized. Call initDB() first.');
  return _db;
}

// ── Spam Numbers ───────────────────────────────────────────────────────────────

/**
 * Checks if a phone number is in the local spam database.
 * Used by SpamCallScreeningService for real-time decisions.
 */
export async function isSpam(phoneNumber: string): Promise<boolean> {
  const [result] = await db().executeSql(
    `SELECT 1 FROM spam_numbers
     WHERE phone_number = ? AND is_active = 1
     LIMIT 1`,
    [phoneNumber],
  );
  return result.rows.length > 0;
}

/**
 * Gets full spam info for a number (for UI display).
 */
export async function getSpamEntry(phoneNumber: string): Promise<SpamEntry | null> {
  const [result] = await db().executeSql(
    `SELECT phone_number, spam_score, category, is_active
     FROM spam_numbers WHERE phone_number = ? LIMIT 1`,
    [phoneNumber],
  );
  if (result.rows.length === 0) return null;
  return result.rows.item(0) as SpamEntry;
}

/**
 * Bulk upserts spam number deltas received from Go /sync endpoint.
 */
export async function applyDeltas(
  deltas: Array<{
    op: 'I' | 'U' | 'D';
    phone_number: string;
    spam_score?: number | null;
    category?: string | null;
    is_active?: boolean | null;
  }>,
): Promise<void> {
  if (deltas.length === 0) return;

  await db().transaction(async (tx: Transaction) => {
    for (const delta of deltas) {
      if (delta.op === 'D') {
        tx.executeSql(
          `UPDATE spam_numbers SET is_active = 0 WHERE phone_number = ?`,
          [delta.phone_number],
        );
      } else {
        tx.executeSql(
          `INSERT INTO spam_numbers(phone_number, spam_score, category, is_active, updated_at)
           VALUES(?, ?, ?, ?, datetime('now'))
           ON CONFLICT(phone_number) DO UPDATE SET
             spam_score = excluded.spam_score,
             category   = excluded.category,
             is_active  = excluded.is_active,
             updated_at = excluded.updated_at`,
          [
            delta.phone_number,
            delta.spam_score ?? 50,
            delta.category ?? 'unknown',
            delta.is_active !== false ? 1 : 0,
          ],
        );
      }
    }
  });
}

// ── Sync Cursor ────────────────────────────────────────────────────────────────

export async function getLastDeltaId(): Promise<number> {
  const [result] = await db().executeSql(
    `SELECT value FROM sync_meta WHERE key = 'last_delta_id'`,
  );
  return parseInt(result.rows.item(0)?.value ?? '0', 10);
}

export async function setLastDeltaId(id: number): Promise<void> {
  await db().executeSql(
    `INSERT OR REPLACE INTO sync_meta(key, value) VALUES('last_delta_id', ?)`,
    [id.toString()],
  );
}

// ── Call Log ───────────────────────────────────────────────────────────────────

export async function addCallLogEntry(entry: Omit<CallLogEntry, 'id'>): Promise<void> {
  await db().executeSql(
    `INSERT INTO call_log(phone_number, screening_result, spam_score, called_at)
     VALUES(?, ?, ?, ?)`,
    [entry.phone_number, entry.screening_result, entry.spam_score, entry.called_at],
  );
  // Trim log to last 500 entries
  await db().executeSql(
    `DELETE FROM call_log WHERE id NOT IN (
       SELECT id FROM call_log ORDER BY called_at DESC LIMIT 500
     )`,
  );
}

export async function getCallLog(limit = 100): Promise<CallLogEntry[]> {
  const [result] = await db().executeSql(
    `SELECT id, phone_number, screening_result, spam_score, called_at
     FROM call_log ORDER BY called_at DESC LIMIT ?`,
    [limit],
  );
  const entries: CallLogEntry[] = [];
  for (let i = 0; i < result.rows.length; i++) {
    entries.push(result.rows.item(i) as CallLogEntry);
  }
  return entries;
}

import { getPhoneNumberVariants, normalizePhoneNumber, getPrefixVariants } from '../utils/phoneUtils';

// ── Personal Block List ────────────────────────────────────────────────────────

export async function addToBlockList(entry: BlockListEntry): Promise<void> {
  const norm = normalizePhoneNumber(entry.phone_number);
  const variants = getPhoneNumberVariants(entry.phone_number);
  
  await db().transaction(async (tx: Transaction) => {
    for (const v of variants) {
      tx.executeSql(
        `INSERT OR REPLACE INTO user_block_list(phone_number, label, created_at)
         VALUES(?, ?, datetime('now'))`,
        [v, entry.label ?? null],
      );
    }
  });
}

export async function removeFromBlockList(phoneNumber: string): Promise<void> {
  const variants = getPhoneNumberVariants(phoneNumber);
  const placeholders = variants.map(() => '?').join(',');
  await db().executeSql(
    `DELETE FROM user_block_list WHERE phone_number IN (${placeholders})`,
    variants,
  );
}

export async function getBlockList(): Promise<BlockListEntry[]> {
  // Return unique E.164 entries or primary representation
  const [result] = await db().executeSql(
    `SELECT phone_number, label FROM user_block_list
     WHERE phone_number LIKE '+%'
     UNION
     SELECT phone_number, label FROM user_block_list
     WHERE phone_number NOT IN (SELECT phone_number FROM user_block_list WHERE phone_number LIKE '+%')
       AND phone_number NOT LIKE '234%'
     ORDER BY phone_number ASC`,
  );
  const entries: BlockListEntry[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < result.rows.length; i++) {
    const item = result.rows.item(i) as BlockListEntry;
    const norm = normalizePhoneNumber(item.phone_number);
    if (!seen.has(norm)) {
      seen.add(norm);
      entries.push({ phone_number: norm, label: item.label });
    }
  }
  return entries;
}

export async function isBlocked(phoneNumber: string): Promise<boolean> {
  const variants = getPhoneNumberVariants(phoneNumber);
  const placeholders = variants.map(() => '?').join(',');
  const [result] = await db().executeSql(
    `SELECT 1 FROM user_block_list WHERE phone_number IN (${placeholders}) LIMIT 1`,
    variants,
  );
  return result.rows.length > 0;
}

// ── Prefix Block List ──────────────────────────────────────────────────────────

export async function addBlockedPrefix(entry: BlockedPrefixEntry): Promise<void> {
  const raw = entry.prefix.trim().replace(/[\s\-().*#]/g, '');
  if (!raw) return;
  await db().executeSql(
    `INSERT OR REPLACE INTO user_block_prefixes(prefix, label, created_at)
     VALUES(?, ?, datetime('now'))`,
    [raw, entry.label ?? 'Telemarketing Prefix'],
  );
}

export async function removeBlockedPrefix(prefix: string): Promise<void> {
  const clean = prefix.trim().replace(/[\s\-().*#]/g, '');
  await db().executeSql(
    `DELETE FROM user_block_prefixes WHERE prefix = ? OR prefix = ?`,
    [clean, prefix.trim()],
  );
}

export async function getBlockedPrefixes(): Promise<BlockedPrefixEntry[]> {
  const [result] = await db().executeSql(
    `SELECT prefix, label FROM user_block_prefixes ORDER BY prefix ASC`,
  );
  const entries: BlockedPrefixEntry[] = [];
  for (let i = 0; i < result.rows.length; i++) {
    const item = result.rows.item(i) as BlockedPrefixEntry;
    entries.push({
      prefix: item.prefix.replace(/[\s\-().*#]/g, ''),
      label: item.label,
    });
  }
  return entries;
}

export async function isPrefixBlocked(phoneNumber: string): Promise<boolean> {
  const prefixes = await getBlockedPrefixes();
  const phoneVariants = getPhoneNumberVariants(phoneNumber);

  for (const { prefix } of prefixes) {
    const prefixVariants = getPrefixVariants(prefix);
    for (const pv of prefixVariants) {
      for (const nv of phoneVariants) {
        if (nv.startsWith(pv)) {
          return true;
        }
      }
    }
  }
  return false;
}

import { BlockListAPI } from './ApiService';

export async function syncBlockListsWithCloud(): Promise<{ numbersCount: number; prefixesCount: number }> {
  const [localNumbers, localPrefixes] = await Promise.all([
    getBlockList(),
    getBlockedPrefixes(),
  ]);

  const res = await BlockListAPI.sync(localNumbers, localPrefixes);
  const { numbers, prefixes } = res.data;

  for (const num of numbers) {
    await addToBlockList(num);
  }
  for (const pref of prefixes) {
    await addBlockedPrefix(pref);
  }

  return { numbersCount: numbers.length, prefixesCount: prefixes.length };
}

export async function closeDB(): Promise<void> {
  if (_db) {
    await _db.close();
    _db = null;
  }
}
