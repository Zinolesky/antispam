package com.antispamapp

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

/**
 * SpamDatabase — lightweight Android SQLite helper for use by SpamCallScreeningService.
 *
 * This is a direct Android SQLite wrapper (not JSI) because CallScreeningService
 * runs in a separate process context where the React Native bridge may not be available.
 *
 * The database file is shared with the JSI SQLite instance by using the same name.
 * Both read from the same antispam.db file; writes from the service are minimal
 * (only call_log inserts and block_list reads).
 */
class SpamDatabase private constructor(context: Context) :
    SQLiteOpenHelper(context, "antispam.db", null, 1) {

    companion object {
        @Volatile
        private var INSTANCE: SpamDatabase? = null

        fun getInstance(context: Context): SpamDatabase =
            INSTANCE ?: synchronized(this) {
                INSTANCE ?: SpamDatabase(context.applicationContext).also { INSTANCE = it }
            }

        fun getNumberVariants(raw: String): List<String> {
            val cleaned = raw.replace(Regex("[\\s\\-().tel:]"), "")
            if (cleaned.isEmpty()) return emptyList()

            val variants = mutableSetOf<String>()
            variants.add(cleaned)
            if (cleaned.startsWith("+")) {
                variants.add(cleaned.substring(1))
            } else {
                variants.add("+$cleaned")
            }

            // Nigerian formats: +2348162051907 <-> 08162051907 <-> 2348162051907
            if (cleaned.startsWith("+234") && cleaned.length == 14) {
                variants.add("0" + cleaned.substring(4))
                variants.add(cleaned.substring(1))
            } else if (cleaned.startsWith("234") && cleaned.length == 13) {
                variants.add("+$cleaned")
                variants.add("0" + cleaned.substring(3))
            } else if (cleaned.startsWith("0") && cleaned.length == 11) {
                variants.add("+234" + cleaned.substring(1))
                variants.add("234" + cleaned.substring(1))
            } else if (cleaned.startsWith("+0") && cleaned.length == 12) {
                // In case carrier or parser prepended + to 0816...
                val rawWithoutPlus = cleaned.substring(1)
                variants.add(rawWithoutPlus)
                if (rawWithoutPlus.startsWith("0") && rawWithoutPlus.length == 11) {
                    variants.add("+234" + rawWithoutPlus.substring(1))
                    variants.add("234" + rawWithoutPlus.substring(1))
                }
            }

            return variants.toList()
        }
    }

    override fun onCreate(db: SQLiteDatabase) {
        // Tables are created by the React Native JSI SQLite on first app launch.
        // This helper only reads from them.
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {}

    data class SpamEntry(
        val phoneNumber: String,
        val spamScore: Int,
        val category: String,
        val isActive: Boolean,
    )

    // ── Spam Numbers ───────────────────────────────────────────────────────────

    fun getSpamEntry(phoneNumber: String): SpamEntry? {
        val variants = getNumberVariants(phoneNumber)
        val placeholders = variants.joinToString(",") { "?" }
        val cursor = readableDatabase.query(
            "spam_numbers",
            arrayOf("phone_number", "spam_score", "category", "is_active"),
            "phone_number IN ($placeholders)",
            variants.toTypedArray(),
            null, null, null,
            "1",
        )
        return cursor.use { c ->
            if (!c.moveToFirst()) return null
            SpamEntry(
                phoneNumber = c.getString(0),
                spamScore = c.getInt(1),
                category = c.getString(2),
                isActive = c.getInt(3) == 1,
            )
        }
    }

    fun isSpam(phoneNumber: String): Boolean {
        val variants = getNumberVariants(phoneNumber)
        val placeholders = variants.joinToString(",") { "?" }
        val cursor = readableDatabase.rawQuery(
            "SELECT 1 FROM spam_numbers WHERE phone_number IN ($placeholders) AND is_active = 1 LIMIT 1",
            variants.toTypedArray(),
        )
        return cursor.use { it.moveToFirst() }
    }

    // ── Block List ─────────────────────────────────────────────────────────────

    fun isBlocked(phoneNumber: String): Boolean {
        val variants = getNumberVariants(phoneNumber)
        val placeholders = variants.joinToString(",") { "?" }
        val cursor = readableDatabase.rawQuery(
            "SELECT 1 FROM user_block_list WHERE phone_number IN ($placeholders) LIMIT 1",
            variants.toTypedArray(),
        )
        return cursor.use { it.moveToFirst() }
    }

    // ── Prefix Block List ──────────────────────────────────────────────────────

    fun getMatchingBlockedPrefix(phoneNumber: String): String? {
        val phoneVariants = getNumberVariants(phoneNumber)

        // 1. Check user_block_prefixes in database
        try {
            readableDatabase.execSQL(
                "CREATE TABLE IF NOT EXISTS user_block_prefixes (prefix TEXT PRIMARY KEY, label TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))"
            )
            val cursor = readableDatabase.rawQuery("SELECT prefix FROM user_block_prefixes", null)
            cursor.use { c ->
                while (c.moveToNext()) {
                    val p = c.getString(0).replace(Regex("[\\s\\-().tel:*#]"), "")
                    val pVariants = getPrefixVariants(p)
                    for (pv in pVariants) {
                        for (nv in phoneVariants) {
                            if (nv.startsWith(pv)) {
                                return p
                            }
                        }
                    }
                }
            }
        } catch (e: Exception) {
            android.util.Log.e("SpamDatabase", "Error checking blocked prefixes: ${e.message}")
        }

        // 2. Default hardcoded fallback prefixes (e.g. 0201888, 0201700)
        val defaultPrefixes = listOf("0201888", "0201700")
        for (dp in defaultPrefixes) {
            val dpVariants = getPrefixVariants(dp)
            for (dpv in dpVariants) {
                for (nv in phoneVariants) {
                    if (nv.startsWith(dpv)) {
                        return dp
                    }
                }
            }
        }

        return null
    }

    private fun getPrefixVariants(rawPrefix: String): List<String> {
        val cleaned = rawPrefix.replace(Regex("[\\s\\-().tel:*#]"), "")
        if (cleaned.isEmpty()) return emptyList()

        val variants = mutableSetOf<String>()
        variants.add(cleaned)
        if (cleaned.startsWith("+")) {
            variants.add(cleaned.substring(1))
        } else {
            variants.add("+$cleaned")
        }

        if (cleaned.startsWith("+234")) {
            variants.add("0" + cleaned.substring(4))
            variants.add(cleaned.substring(1))
        } else if (cleaned.startsWith("234")) {
            variants.add("+$cleaned")
            variants.add("0" + cleaned.substring(3))
        } else if (cleaned.startsWith("0")) {
            variants.add("+234" + cleaned.substring(1))
            variants.add("234" + cleaned.substring(1))
            variants.add("+$cleaned")
        }

        return variants.toList()
    }

    // ── Call Log ───────────────────────────────────────────────────────────────

    fun logCall(phoneNumber: String, result: String, spamScore: Int) {
        try {
            val values = ContentValues().apply {
                put("phone_number", phoneNumber)
                put("screening_result", result)
                put("spam_score", spamScore)
                put("called_at", java.time.Instant.now().toString())
            }
            writableDatabase.insertOrThrow("call_log", null, values)
        } catch (e: Exception) {
            android.util.Log.e("SpamDatabase", "Failed to log call: ${e.message}")
        }
    }
}
