package com.antispamapp

import android.telecom.Call
import android.telecom.CallScreeningService
import com.facebook.react.bridge.Arguments
import com.facebook.react.ReactApplication

/**
 * SpamCallScreeningService — Android Telecom CallScreeningService.
 *
 * This service is invoked by the Android Telecom framework for every incoming call
 * when the app holds the ROLE_CALL_SCREENING role.
 *
 * Decision flow:
 *   1. Normalize the incoming phone number to E.164
 *   2. Query the local SQLite database (via SpamDatabase helper)
 *   3. Check the user's personal block list
 *   4. Return a CallResponse: allow / silence / reject
 *   5. Log the outcome and emit a JS event for UI update
 *
 * Note: This service runs on the main thread. SQLite queries must be synchronous
 * (react-native-sqlite-storage JSI mode satisfies this requirement).
 */
class SpamCallScreeningService : CallScreeningService() {

    companion object {
        // Threshold above which calls are silenced (vs full reject)
        private const val SILENCE_THRESHOLD = 50
        private const val REJECT_THRESHOLD = 85
    }

    override fun onScreenCall(callDetails: Call.Details) {
        val rawHandle = callDetails.handle?.schemeSpecificPart ?: run {
            respondToCall(callDetails, buildAllowResponse())
            return
        }

        val phoneNumber = normalizeNumber(rawHandle)
        val db = SpamDatabase.getInstance(applicationContext)

        // 1. Check personal block list (highest priority)
        if (db.isBlocked(phoneNumber)) {
            val response = CallResponse.Builder()
                .setDisallowCall(true)
                .setRejectCall(true)
                .setSkipCallLog(false)
                .setSkipNotification(true)
                .build()
            respondToCall(callDetails, response)
            emitScreeningEvent(phoneNumber, "rejected", 100)
            db.logCall(phoneNumber, "rejected", 100)
            return
        }

        // 1b. Check prefix block list (e.g. 0201888, 0201700)
        val matchedPrefix = db.getMatchingBlockedPrefix(phoneNumber)
        if (matchedPrefix != null) {
            val response = CallResponse.Builder()
                .setDisallowCall(true)
                .setRejectCall(true)
                .setSkipCallLog(false)
                .setSkipNotification(true)
                .build()
            respondToCall(callDetails, response)
            emitScreeningEvent(phoneNumber, "rejected", 100)
            db.logCall(phoneNumber, "rejected", 100)
            return
        }

        // 2. Check spam database
        val spamEntry = db.getSpamEntry(phoneNumber)
        if (spamEntry != null && spamEntry.isActive) {
            val response = when {
                spamEntry.spamScore >= REJECT_THRESHOLD -> CallResponse.Builder()
                    .setDisallowCall(true)
                    .setRejectCall(true)
                    .setSkipCallLog(false)
                    .setSkipNotification(true)
                    .build()
                spamEntry.spamScore >= SILENCE_THRESHOLD -> CallResponse.Builder()
                    .setDisallowCall(true)
                    .setRejectCall(false)  // Send to voicemail
                    .setSkipCallLog(false)
                    .setSkipNotification(false)
                    .build()
                else -> buildAllowResponse()
            }

            val result = when {
                spamEntry.spamScore >= REJECT_THRESHOLD -> "rejected"
                spamEntry.spamScore >= SILENCE_THRESHOLD -> "silenced"
                else -> "allowed"
            }

            respondToCall(callDetails, response)
            emitScreeningEvent(phoneNumber, result, spamEntry.spamScore)
            db.logCall(phoneNumber, result, spamEntry.spamScore)
        } else {
            // Number not in spam DB — allow
            respondToCall(callDetails, buildAllowResponse())
            emitScreeningEvent(phoneNumber, "allowed", 0)
            db.logCall(phoneNumber, "allowed", 0)
        }
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private fun buildAllowResponse(): CallResponse =
        CallResponse.Builder()
            .setDisallowCall(false)
            .setRejectCall(false)
            .setSkipCallLog(false)
            .setSkipNotification(false)
            .build()

    /**
     * Normalizes a raw number string to E.164 format.
     * Strips tel: prefix, whitespace, dashes, parentheses.
     * Prepends +1 for US 10-digit numbers as a fallback.
     */
    private fun normalizeNumber(raw: String): String {
        val cleaned = raw.replace(Regex("[\\s\\-().tel:]"), "")
        if (cleaned.startsWith("+234") && cleaned.length == 14) return cleaned
        // Nigerian 11-digit format starting with 0: e.g. 08162051907 -> +2348162051907
        if (cleaned.startsWith("0") && cleaned.length == 11 && cleaned.all { it.isDigit() }) {
            return "+234" + cleaned.substring(1)
        }
        if (cleaned.startsWith("234") && cleaned.length == 13 && cleaned.all { it.isDigit() }) {
            return "+$cleaned"
        }
        if (cleaned.startsWith("+0") && cleaned.length == 12 && cleaned.substring(1).all { it.isDigit() }) {
            return "+234" + cleaned.substring(2)
        }
        if (cleaned.startsWith("+")) return cleaned
        if (cleaned.length == 10 && cleaned.all { it.isDigit() }) return "+1$cleaned"
        if (cleaned.length == 11 && cleaned.startsWith("1")) return "+$cleaned"
        return "+$cleaned"
    }

    /**
     * Emits an onCallScreened event to JavaScript via the CallScreeningModule.
     */
    private fun emitScreeningEvent(phoneNumber: String, result: String, spamScore: Int) {
        try {
            val reactApp = application as? ReactApplication ?: return
            val catalystInstance = reactApp.reactNativeHost
                .reactInstanceManager
                .currentReactContext
                ?.catalystInstance ?: return

            // Get the module from the React Native registry
            val module = reactApp.reactNativeHost
                .reactInstanceManager
                .currentReactContext
                ?.getNativeModule(CallScreeningModule::class.java) ?: return

            val params = Arguments.createMap().apply {
                putString("phoneNumber", phoneNumber)
                putString("result", result)
                putInt("spamScore", spamScore)
            }
            module.emitEvent(CallScreeningModule.EVENT_CALL_SCREENED, params)
        } catch (e: Exception) {
            android.util.Log.e("SpamScreening", "Failed to emit event: ${e.message}")
        }
    }
}
