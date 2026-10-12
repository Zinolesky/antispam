import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Symbol } from './stitch';
import { a, c, fonts } from '../theme/stitch';

export interface StitchAlertButton {
  text?: string;
  onPress?: () => void | Promise<void>;
  style?: 'default' | 'cancel' | 'destructive';
}

export interface StitchAlertOptions {
  cancelable?: boolean;
  onDismiss?: () => void;
  icon?: string;
  iconColor?: string;
  dotColor?: string;
  capsule?: string;
  capsuleIcon?: string;
  variant?: 'destructive' | 'primary' | 'success' | 'warning' | 'neutral';
}

export interface StitchAlertConfig {
  title: string;
  message?: string;
  buttons?: StitchAlertButton[];
  options?: StitchAlertOptions;
}

// Global imperative handler reference
let globalShowAlert: ((config: StitchAlertConfig) => void) | null = null;

/**
 * Imperative Stitch Alert trigger matching React Native's Alert.alert API
 * with automatic Obsidian Sentinel theme styling.
 */
export function stitchAlert(
  title: string,
  message?: string,
  buttons?: StitchAlertButton[],
  options?: StitchAlertOptions,
) {
  if (globalShowAlert) {
    globalShowAlert({ title, message, buttons, options });
  } else {
    console.warn('[StitchAlert] No active StitchAlertProvider mounted.');
  }
}

// Support both Alert.alert(...) and stitchAlert(...)
stitchAlert.alert = stitchAlert;

export const Alert = {
  alert: stitchAlert,
};

export const StitchAlert = {
  alert: stitchAlert,
};

interface AlertState extends StitchAlertConfig {
  visible: boolean;
}

const AlertContext = createContext<{
  show: (config: StitchAlertConfig) => void;
  hide: () => void;
}>({
  show: () => {},
  hide: () => {},
});

export const useStitchAlert = () => useContext(AlertContext);

export function StitchAlertProvider({ children }: { children: React.ReactNode }) {
  const [alertState, setAlertState] = useState<AlertState>({
    visible: false,
    title: '',
  });

  const show = useCallback((config: StitchAlertConfig) => {
    setAlertState({
      ...config,
      visible: true,
    });
  }, []);

  const hide = useCallback(() => {
    setAlertState(prev => {
      if (prev.options?.onDismiss) {
        prev.options.onDismiss();
      }
      return { ...prev, visible: false };
    });
  }, []);

  useEffect(() => {
    globalShowAlert = show;
    return () => {
      if (globalShowAlert === show) {
        globalShowAlert = null;
      }
    };
  }, [show]);

  return (
    <AlertContext.Provider value={{ show, hide }}>
      {children}
      <StitchAlertDialog
        visible={alertState.visible}
        title={alertState.title}
        message={alertState.message}
        buttons={alertState.buttons}
        options={alertState.options}
        onClose={hide}
      />
    </AlertContext.Provider>
  );
}

/**
 * Reusable modal dialog matching Stitch preview node:
 * https://stitch.withgoogle.com/preview/7877981686092996812?node-id=1b25b9daa7274fc6b79d80f314102ad3
 */
export function StitchAlertDialog({
  visible,
  title,
  message,
  buttons,
  options,
  onClose,
}: {
  visible: boolean;
  title: string;
  message?: string;
  buttons?: StitchAlertButton[];
  options?: StitchAlertOptions;
  onClose: () => void;
}) {
  if (!visible) return null;

  // Determine smart defaults based on title / content if not explicitly specified
  const titleLower = (title || '').toLowerCase();
  const isSignOut = titleLower.includes('sign out') || titleLower.includes('logout');
  const isDeleteOrRemove = titleLower.includes('remove') || titleLower.includes('delete');
  const isBlockOrQuarantine = titleLower.includes('quarantin') || titleLower.includes('block');
  const isSafeOrAllow = titleLower.includes('safe') || titleLower.includes('unblock') || titleLower.includes('allow');
  const isErrorOrFailed = titleLower.includes('error') || titleLower.includes('fail') || titleLower.includes('invalid');
  const isSuccessOrSync = titleLower.includes('sync') || titleLower.includes('connected') || titleLower.includes('success');

  // Variant resolution
  let variant = options?.variant;
  if (!variant) {
    if (isSignOut || isDeleteOrRemove || isBlockOrQuarantine || isErrorOrFailed) {
      variant = 'destructive';
    } else if (isSafeOrAllow || isSuccessOrSync) {
      variant = 'success';
    } else {
      variant = 'primary';
    }
  }

  // Icon resolution
  let iconName = options?.icon;
  if (!iconName) {
    if (isSignOut) iconName = 'logout';
    else if (isDeleteOrRemove) iconName = 'delete';
    else if (isBlockOrQuarantine) iconName = 'block';
    else if (isSafeOrAllow) iconName = 'verified_user';
    else if (isErrorOrFailed) iconName = 'error';
    else if (isSuccessOrSync) iconName = 'cloud_done';
    else iconName = 'info';
  }

  // Colors based on variant
  let themeColor = '#EF4444';
  let badgeBg = 'rgba(239, 68, 68, 0.12)';
  let badgeBorder = 'rgba(239, 68, 68, 0.25)';
  let dotColor = options?.dotColor || '#EF4444';

  if (variant === 'destructive') {
    themeColor = '#EF4444';
    badgeBg = 'rgba(239, 68, 68, 0.14)';
    badgeBorder = 'rgba(239, 68, 68, 0.28)';
    dotColor = '#EF4444';
  } else if (variant === 'success') {
    themeColor = '#40E17E';
    badgeBg = 'rgba(64, 225, 126, 0.14)';
    badgeBorder = 'rgba(64, 225, 126, 0.28)';
    dotColor = '#40E17E';
  } else if (variant === 'warning') {
    themeColor = '#FFB95D';
    badgeBg = 'rgba(255, 185, 93, 0.14)';
    badgeBorder = 'rgba(255, 185, 93, 0.28)';
    dotColor = '#FFB95D';
  } else {
    // primary
    themeColor = '#8B80FF';
    badgeBg = 'rgba(139, 128, 255, 0.14)';
    badgeBorder = 'rgba(139, 128, 255, 0.28)';
    dotColor = '#8B80FF';
  }

  if (options?.iconColor) themeColor = options.iconColor;
  if (options?.dotColor) dotColor = options.dotColor;

  // Status capsule resolution (e.g. AES-256 Rules Preserved Locally)
  let capsuleText = options?.capsule;
  let capsuleIcon = options?.capsuleIcon || 'shield';
  if (!capsuleText) {
    if (isSignOut) {
      capsuleText = 'AES-256 Rules Preserved Locally';
      capsuleIcon = 'shield';
    } else if (isBlockOrQuarantine) {
      capsuleText = 'Instant Local Enforcement';
      capsuleIcon = 'shield';
    } else if (isSuccessOrSync) {
      capsuleText = 'Shield Cloud Sync Verified';
      capsuleIcon = 'cloud_done';
    } else if (isSafeOrAllow) {
      capsuleText = 'Verified Safe List';
      capsuleIcon = 'verified_user';
    }
  }

  // Normalize buttons
  const normalizedButtons = (buttons && buttons.length > 0)
    ? buttons
    : [{ text: 'OK', style: 'default' as const }];

  // Partition buttons:
  // If there's a cancel button, we put it at the bottom (secondary button)
  // Destructive / confirm button goes to the top (primary action)
  const cancelBtn = normalizedButtons.find(b => b.style === 'cancel');
  const actionBtns = normalizedButtons.filter(b => b.style !== 'cancel');

  const handlePress = async (btn?: StitchAlertButton) => {
    onClose();
    if (btn?.onPress) {
      try {
        await btn.onPress();
      } catch (err) {
        console.error('[StitchAlert] Button onPress error:', err);
      }
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (options?.cancelable !== false) {
          handlePress(cancelBtn);
        }
      }}>
      <TouchableWithoutFeedback
        onPress={() => {
          if (options?.cancelable !== false) {
            handlePress(cancelBtn);
          }
        }}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback>
            <View style={styles.card}>
              {/* Icon Container with Dot Indicator */}
              <View style={styles.iconWrapper}>
                <View
                  style={[
                    styles.iconBox,
                    {
                      backgroundColor: badgeBg,
                      borderColor: badgeBorder,
                    },
                  ]}>
                  <Symbol name={iconName} size={28} color={themeColor} filled />
                </View>
                {/* Status Dot */}
                <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
              </View>

              {/* Title */}
              <Text style={styles.title}>{title}</Text>

              {/* Message */}
              {!!message && <Text style={styles.message}>{message}</Text>}

              {/* Status Capsule (e.g. AES-256 Rules Preserved Locally) */}
              {!!capsuleText && (
                <View style={styles.capsuleContainer}>
                  <Symbol name={capsuleIcon} size={14} color="#818CF8" filled />
                  <Text style={styles.capsuleText}>{capsuleText}</Text>
                </View>
              )}

              {/* Action Buttons Stack */}
              <View style={styles.buttonStack}>
                {actionBtns.map((btn, index) => {
                  const isDestructive = btn.style === 'destructive' || (variant === 'destructive' && actionBtns.length === 1 && !btn.style);
                  const isRedAction = isDestructive || (isSignOut && index === 0);
                  
                  // Text formatting: if sign out and no arrow, add arrow
                  let btnLabel = btn.text || 'Confirm';
                  if (isSignOut && !btnLabel.includes('→') && !btnLabel.includes('Sign In')) {
                    btnLabel = `→ ${btnLabel}`;
                  }

                  let bg = c.primaryContainer;
                  let textColor = '#FFFFFF';
                  if (isRedAction) {
                    bg = '#E11D48'; // Stitch vibrant red
                  } else if (variant === 'success') {
                    bg = '#00C263';
                  }

                  return (
                    <TouchableOpacity
                      key={index}
                      activeOpacity={0.85}
                      style={[
                        styles.primaryButton,
                        { backgroundColor: bg },
                        index > 0 && { marginTop: 10 },
                      ]}
                      onPress={() => handlePress(btn)}>
                      <Text style={[styles.primaryButtonText, { color: textColor }]}>
                        {btnLabel}
                      </Text>
                    </TouchableOpacity>
                  );
                })}

                {/* Secondary / Cancel Button */}
                {cancelBtn && (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={styles.secondaryButton}
                    onPress={() => handlePress(cancelBtn)}>
                    <Text style={styles.secondaryButtonText}>
                      {cancelBtn.text || (isSignOut ? 'Keep Signed In' : 'Cancel')}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(5, 5, 12, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#121222',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 22,
    paddingTop: 28,
    paddingBottom: 22,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.6,
    shadowRadius: 32,
    elevation: 24,
  },
  iconWrapper: {
    position: 'relative',
    marginBottom: 6,
  },
  iconBox: {
    width: 64,
    height: 64,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    borderWidth: 1.5,
    borderColor: '#121222',
  },
  title: {
    fontFamily: fonts.grotesk700,
    fontSize: 19,
    lineHeight: 25,
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 14,
    marginBottom: 8,
  },
  message: {
    fontFamily: fonts.manrope400,
    fontSize: 13.5,
    lineHeight: 20,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 16,
  },
  capsuleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: 'rgba(25, 25, 44, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 16,
    width: '100%',
    marginBottom: 20,
  },
  capsuleText: {
    fontFamily: fonts.mono600,
    fontSize: 11.5,
    color: '#C7D2FE',
    letterSpacing: 0.4,
  },
  buttonStack: {
    width: '100%',
  },
  primaryButton: {
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonText: {
    fontFamily: fonts.manrope700,
    fontSize: 14.5,
    letterSpacing: 0.2,
  },
  secondaryButton: {
    height: 48,
    borderRadius: 14,
    backgroundColor: '#1E1E34',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  secondaryButtonText: {
    fontFamily: fonts.manrope600,
    fontSize: 14.5,
    color: '#CBD5E1',
  },
});
