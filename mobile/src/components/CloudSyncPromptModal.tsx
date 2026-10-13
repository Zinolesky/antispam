/**
 * CloudSyncPromptModal — Prompts the user when cross-device blocklist rule
 * changes or remote session revocation events are detected.
 */
import React from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
} from 'react-native';
import { useAppStore } from '../store/useAppStore';
import { a, c, t } from '../theme/stitch';
import { Symbol } from './stitch';

export function CloudSyncPromptModal() {
  const {
    pendingCloudDiff,
    applyCloudBlocklistChanges,
    dismissCloudBlocklistChanges,
    cloudNotificationMessage,
    clearCloudNotification,
  } = useAppStore();

  if (cloudNotificationMessage && !pendingCloudDiff) {
    return (
      <Modal transparent animationType="fade" visible>
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <View style={[styles.iconRing, { backgroundColor: a(c.tertiary, 0.12), borderColor: a(c.tertiary, 0.3) }]}>
              <Symbol name="cloud_off" size={28} color={c.tertiary} />
            </View>

            <Text style={[t.headlineSm, styles.title]}>Offline Protection Active</Text>
            <Text style={[t.bodySm, styles.description]}>
              {cloudNotificationMessage}
            </Text>

            <TouchableOpacity
              activeOpacity={0.8}
              style={[styles.primaryButton, { backgroundColor: c.primary }]}
              onPress={clearCloudNotification}
            >
              <Text style={[t.labelLg, { color: c.onPrimary, fontWeight: '700' }]}>
                Got it
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  if (!pendingCloudDiff) return null;

  const {
    numbersToAdd,
    numbersToRemove,
    prefixesToAdd,
    prefixesToRemove,
    totalChanges,
  } = pendingCloudDiff;

  return (
    <Modal transparent animationType="fade" visible>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={[styles.iconRing, { backgroundColor: a(c.primary, 0.12), borderColor: a(c.primary, 0.3) }]}>
            <Symbol name="cloud_sync" size={28} color={c.primary} />
          </View>

          <Text style={[t.headlineSm, styles.title]}>Cloud Changes Detected</Text>
          <Text style={[t.bodySm, styles.description]}>
            Another device modified your personal call protection rules ({totalChanges} change{totalChanges === 1 ? '' : 's'}). Would you like to apply them to this phone?
          </Text>

          <ScrollView style={styles.changesList} showsVerticalScrollIndicator={false}>
            {numbersToAdd.map(item => (
              <View key={`add-num-${item.phone_number}`} style={styles.changeRow}>
                <View style={[styles.badge, { backgroundColor: a(c.secondary, 0.12), borderColor: a(c.secondary, 0.3) }]}>
                  <Text style={[t.labelSm, { color: c.secondary }]}>+ ADD NUMBER</Text>
                </View>
                <Text style={[t.bodySm, styles.ruleValue]}>{item.phone_number}</Text>
              </View>
            ))}

            {numbersToRemove.map(item => (
              <View key={`rem-num-${item.phone_number}`} style={styles.changeRow}>
                <View style={[styles.badge, { backgroundColor: a(c.error, 0.12), borderColor: a(c.error, 0.3) }]}>
                  <Text style={[t.labelSm, { color: c.error }]}>- REMOVE NUMBER</Text>
                </View>
                <Text style={[t.bodySm, styles.ruleValue]}>{item.phone_number}</Text>
              </View>
            ))}

            {prefixesToAdd.map(item => (
              <View key={`add-pref-${item.prefix}`} style={styles.changeRow}>
                <View style={[styles.badge, { backgroundColor: a(c.primary, 0.12), borderColor: a(c.primary, 0.3) }]}>
                  <Text style={[t.labelSm, { color: c.primary }]}>+ ADD PREFIX</Text>
                </View>
                <Text style={[t.bodySm, styles.ruleValue]}>{item.prefix}</Text>
              </View>
            ))}

            {prefixesToRemove.map(item => (
              <View key={`rem-pref-${item.prefix}`} style={styles.changeRow}>
                <View style={[styles.badge, { backgroundColor: a(c.error, 0.12), borderColor: a(c.error, 0.3) }]}>
                  <Text style={[t.labelSm, { color: c.error }]}>- REMOVE PREFIX</Text>
                </View>
                <Text style={[t.bodySm, styles.ruleValue]}>{item.prefix}</Text>
              </View>
            ))}
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity
              activeOpacity={0.8}
              style={[styles.primaryButton, { backgroundColor: c.primary }]}
              onPress={applyCloudBlocklistChanges}
            >
              <Text style={[t.labelLg, { color: c.onPrimary, fontWeight: '700' }]}>
                Apply to This Phone
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              style={styles.secondaryButton}
              onPress={dismissCloudBlocklistChanges}
            >
              <Text style={[t.labelMd, { color: c.onSurfaceVariant }]}>
                Keep This Phone's Rules
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(5, 5, 12, 0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxHeight: '80%',
    backgroundColor: c.surfaceContainer,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: a(c.outline, 0.2),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 16,
  },
  iconRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    color: c.onSurface,
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    color: c.onSurfaceVariant,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  changesList: {
    width: '100%',
    maxHeight: 180,
    marginBottom: 20,
    backgroundColor: a(c.surfaceContainerLowest, 0.5),
    borderRadius: 14,
    padding: 8,
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    gap: 10,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  ruleValue: {
    color: c.onSurface,
    fontWeight: '600',
    flex: 1,
  },
  actions: {
    width: '100%',
    gap: 10,
  },
  primaryButton: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButton: {
    width: '100%',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
