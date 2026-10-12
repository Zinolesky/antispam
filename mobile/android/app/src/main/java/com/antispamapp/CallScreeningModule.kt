package com.antispamapp

import android.app.role.RoleManager
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.annotation.RequiresApi
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * CallScreeningModule — React Native NativeModule.
 *
 * Bridges the Android RoleManager (ROLE_CALL_SCREENING) to JavaScript.
 * Emits events:
 *   - onRoleGranted: Role was successfully granted
 *   - onRoleDenied: User denied the role request
 *   - onCallScreened: A call was screened (emitted by SpamCallScreeningService)
 *
 * Exposed JS methods:
 *   - requestScreeningRole(): void
 *   - hasScreeningRole(): Promise<Boolean>
 *   - getScreeningStatus(): Promise<String>
 */
class CallScreeningModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "CallScreeningModule"
        const val ROLE_REQUEST_CODE = 1001

        // Event names (must match NativeBridge.ts)
        const val EVENT_ROLE_GRANTED = "onRoleGranted"
        const val EVENT_ROLE_DENIED = "onRoleDenied"
        const val EVENT_CALL_SCREENED = "onCallScreened"
    }

    override fun getName(): String = NAME

    // ── Role Management ────────────────────────────────────────────────────────

    @ReactMethod
    fun requestScreeningRole() {
        val activity = currentActivity ?: run {
            emitEvent(EVENT_ROLE_DENIED, null)
            return
        }

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            // Pre-Android 10: RoleManager not available
            emitEvent(EVENT_ROLE_DENIED, null)
            return
        }

        val roleManager = activity.getSystemService(Context.ROLE_SERVICE) as RoleManager

        if (roleManager.isRoleHeld(RoleManager.ROLE_CALL_SCREENING)) {
            emitEvent(EVENT_ROLE_GRANTED, null)
            return
        }

        val intent = roleManager.createRequestRoleIntent(RoleManager.ROLE_CALL_SCREENING)
        activity.startActivityForResult(intent, ROLE_REQUEST_CODE)
        // Result handled in onActivityResult via the activity listener below
    }

    @ReactMethod
    fun hasScreeningRole(promise: Promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            promise.resolve(false)
            return
        }
        val roleManager = reactContext.getSystemService(Context.ROLE_SERVICE) as RoleManager
        promise.resolve(roleManager.isRoleHeld(RoleManager.ROLE_CALL_SCREENING))
    }

    @ReactMethod
    fun getScreeningStatus(promise: Promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            promise.resolve("not_requested")
            return
        }
        val roleManager = reactContext.getSystemService(Context.ROLE_SERVICE) as RoleManager
        val status = if (roleManager.isRoleHeld(RoleManager.ROLE_CALL_SCREENING)) "granted" else "denied"
        promise.resolve(status)
    }

    // ── Guard Pause / Resume ───────────────────────────────────────────────────

    @ReactMethod
    fun setScreeningPaused(paused: Boolean) {
        val prefs = reactContext.getSharedPreferences("antispam_prefs", Context.MODE_PRIVATE)
        prefs.edit().putBoolean("is_screening_paused", paused).apply()
    }

    @ReactMethod
    fun isScreeningPaused(promise: Promise) {
        val prefs = reactContext.getSharedPreferences("antispam_prefs", Context.MODE_PRIVATE)
        promise.resolve(prefs.getBoolean("is_screening_paused", false))
    }

    // ── Event emission ─────────────────────────────────────────────────────────

    /**
     * Emits a JavaScript event to all registered listeners.
     * Called from SpamCallScreeningService via the application context.
     */
    fun emitEvent(eventName: String, params: WritableMap?) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    // ── Activity Result ─────────────────────────────────────────────────────────

    /**
     * Handles the ROLE_CALL_SCREENING permission dialog result.
     * Must be wired up in MainActivity.kt via onActivityResult.
     */
    fun handleActivityResult(requestCode: Int, resultCode: Int) {
        if (requestCode != ROLE_REQUEST_CODE) return
        if (resultCode == android.app.Activity.RESULT_OK) {
            emitEvent(EVENT_ROLE_GRANTED, null)
        } else {
            emitEvent(EVENT_ROLE_DENIED, null)
        }
    }

    // Required for NativeEventEmitter on the JS side
    @ReactMethod
    fun addListener(eventName: String) { /* no-op */ }

    @ReactMethod
    fun removeListeners(count: Int) { /* no-op */ }
}
