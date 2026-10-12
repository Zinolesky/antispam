/**
 * NativeBridge — bridges JavaScript to the Android CallScreeningModule native module.
 *
 * The native module (CallScreeningModule.kt) must be registered in MainApplication.
 * Methods exposed here map 1:1 to @ReactMethod functions in Kotlin.
 */
import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

const { CallScreeningModule } = NativeModules;

if (!CallScreeningModule && Platform.OS === 'android') {
  console.warn(
    '[NativeBridge] CallScreeningModule not found. ' +
    'Ensure the Kotlin module is registered in MainApplication.kt.',
  );
}

export type ScreeningRoleStatus = 'granted' | 'denied' | 'not_requested';

// ── Event emitter ──────────────────────────────────────────────────────────────
let _emitter: NativeEventEmitter | null = null;

function getEmitter(): NativeEventEmitter {
  if (!_emitter && CallScreeningModule) {
    _emitter = new NativeEventEmitter(CallScreeningModule);
  }
  if (!_emitter) throw new Error('CallScreeningModule not available');
  return _emitter;
}

/**
 * Listen for the Call Screening role being granted by the user.
 */
export function onRoleGranted(callback: () => void) {
  return getEmitter().addListener('onRoleGranted', callback);
}

/**
 * Listen for the Call Screening role being denied by the user.
 */
export function onRoleDenied(callback: () => void) {
  return getEmitter().addListener('onRoleDenied', callback);
}

/**
 * Listen for real-time screening results (emitted from SpamCallScreeningService).
 */
export function onCallScreened(
  callback: (event: {
    phoneNumber: string;
    result: 'allowed' | 'silenced' | 'rejected';
    spamScore: number;
  }) => void,
) {
  return getEmitter().addListener('onCallScreened', callback);
}

// ── Role management ────────────────────────────────────────────────────────────

/**
 * Requests the Android ROLE_CALL_SCREENING role from the user.
 * The system shows a permission dialog. Result is delivered via events:
 * onRoleGranted or onRoleDenied.
 */
export function requestScreeningRole(): void {
  if (Platform.OS !== 'android') {
    console.warn('[NativeBridge] requestScreeningRole is Android-only');
    return;
  }
  CallScreeningModule?.requestScreeningRole();
}

/**
 * Checks if the app currently holds the Call Screening role.
 */
export async function hasScreeningRole(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    return await CallScreeningModule?.hasScreeningRole();
  } catch {
    return false;
  }
}

/**
 * Returns the current screening status: 'granted' | 'denied' | 'not_requested'
 */
export async function getScreeningStatus(): Promise<ScreeningRoleStatus> {
  if (Platform.OS !== 'android') return 'not_requested';
  try {
    return await CallScreeningModule?.getScreeningStatus();
  } catch {
    return 'not_requested';
  }
}
