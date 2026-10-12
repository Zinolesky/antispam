/**
 * HomeScreen — ShieldCall AI Defense Dashboard.
 * Mirrors design/stitch/.../dashboard_active_shield/code.html.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Linking,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { stitchAlert as Alert } from '../components/StitchAlert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

import {
  getCallLog,
  CallLogEntry,
  addToBlockList,
  removeFromBlockList,
} from '@services/DatabaseService';
import {
  hasScreeningRole,
  requestScreeningRole,
  onRoleGranted,
  onRoleDenied,
  onCallScreened,
} from '@services/NativeBridge';
import { syncOnce } from '@services/SyncService';
import { useAppStore } from '@store/useAppStore';
import { Badge, CallActionSheet, IconNode, StitchToggle, Symbol } from '../components/stitch';
import { a, c, fonts, t } from '../theme/stitch';
import { detectCarrier, timeAgo } from '../utils/carrier';

function describeCall(item: CallLogEntry) {
  const score = item.spam_score ?? null;
  if (item.screening_result === 'allowed') {
    return {
      kind: 'allowed' as const,
      icon: 'check_circle',
      filled: true,
      color: c.secondary,
      badge: 'ALLOWED',
      sub: score != null && score > 0 ? `Score ${(score / 100).toFixed(2)}` : 'Verified Contact',
    };
  }
  if (item.screening_result === 'silenced') {
    return {
      kind: 'silenced' as const,
      icon: 'volume_off',
      filled: false,
      color: c.tertiary,
      badge: 'SILENCED',
      sub: score != null ? `Score ${score}` : 'Screening',
    };
  }
  const critical = score == null || score >= 99;
  return {
    kind: critical ? ('critical' as const) : ('blocked' as const),
    icon: critical ? 'gpp_bad' : 'phone_disabled',
    filled: false,
    color: c.error,
    badge: critical ? `REJECTED ${score ?? 100}%` : `BLOCKED (${score}% Spam)`,
    sub: 'Threat: Critical',
  };
}

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const {
    hasScreeningRole: roleGranted,
    setScreeningRole,
    isScreeningPaused,
    setScreeningPaused,
    setSyncStatus,
    isSyncing,
    lastSyncAt,
    user,
  } = useAppStore();
  const [callLog, setCallLog] = useState<CallLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCall, setSelectedCall] = useState<CallLogEntry | null>(null);

  const pulse = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const loadData = useCallback(async () => {
    try {
      const [log, role] = await Promise.all([getCallLog(50), hasScreeningRole()]);
      setCallLog(log);
      setScreeningRole(role);
    } finally {
      setLoading(false);
    }
  }, [setScreeningRole]);

  useEffect(() => {
    loadData();
    const grantedSub = onRoleGranted(() => setScreeningRole(true));
    const deniedSub = onRoleDenied(() => setScreeningRole(false));
    const screenedSub = onCallScreened(event => {
      setCallLog(prev => [
        {
          phone_number: event.phoneNumber,
          screening_result: event.result,
          spam_score: event.spamScore,
          called_at: new Date().toISOString(),
        },
        ...prev.slice(0, 49),
      ]);
    });
    return () => {
      grantedSub.remove();
      deniedSub.remove();
      screenedSub.remove();
    };
  }, [loadData, setScreeningRole]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setSyncStatus({ syncing: true });
    spin.setValue(0);
    Animated.timing(spin, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    try {
      const result = await syncOnce();
      setSyncStatus({ lastSyncAt: new Date(), deltasCount: result.deltasApplied, syncing: false });
      await loadData();
    } catch {
      setSyncStatus({ syncing: false });
    } finally {
      setRefreshing(false);
    }
  }, [loadData, setSyncStatus, spin]);

  const handleBlock = async () => {
    if (!selectedCall) return;
    const phone = selectedCall.phone_number;
    setSelectedCall(null);
    await addToBlockList({ phone_number: phone, label: 'Blocked from Recents' });
    await loadData();
    Alert.alert('Number Blacklisted', `Calls from ${phone} will now be rejected automatically.`);
  };

  const handleWhitelist = async () => {
    if (!selectedCall) return;
    const phone = selectedCall.phone_number;
    setSelectedCall(null);
    await removeFromBlockList(phone);
    await loadData();
    Alert.alert('Added to Verified Safe List', `Calls from ${phone} will now be allowed.`);
  };

  const handleReport = () => {
    if (!selectedCall) return;
    const phone = selectedCall.phone_number;
    setSelectedCall(null);
    navigation.navigate('Report', { prefillNumber: phone });
  };

  const renderCallItem = ({ item }: { item: CallLogEntry }) => {
    const d = describeCall(item);
    const isThreat = d.kind === 'blocked' || d.kind === 'critical';
    return (
      <TouchableOpacity
        style={[
          styles.callCard,
          d.kind === 'critical' && { borderColor: a(c.error, 0.4) },
        ]}
        activeOpacity={0.8}
        onPress={() => setSelectedCall(item)}
        onLongPress={() => setSelectedCall(item)}
        delayLongPress={180}>
        <View style={styles.callLeft}>
          <IconNode
            icon={d.icon}
            color={d.color}
            filled={d.filled}
            size={40}
            radius={20}
            iconSize={18}
            borderAlpha={d.kind === 'critical' ? 1 : d.kind === 'allowed' ? 0.4 : 0.5}
            background={d.kind === 'critical' ? a(c.errorContainer, 0.4) : undefined}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.callPhone]} numberOfLines={1}>
              {item.phone_number}
            </Text>
            <Text
              style={[t.bodySm, { color: isThreat ? a(c.error, 0.9) : c.outline }]}
              numberOfLines={1}>
              {detectCarrier(item.phone_number)}
              <Text style={{ fontSize: 8 }}>  •  </Text>
              {timeAgo(item.called_at)}
            </Text>
          </View>
        </View>
        <View style={styles.callRight}>
          <Badge label={d.badge} color={d.color} fillAlpha={d.kind === 'critical' ? 0.15 : 0.1} />
          <Text
            style={[
              t.labelCode,
              { fontSize: 11, color: isThreat ? c.error : c.outline },
              isThreat && { fontFamily: fonts.mono600 },
            ]}>
            {d.sub}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={c.primaryContainer} />
      </View>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const screenedToday = callLog.filter(x => x.called_at.startsWith(today)).length;
  const blockedCount = callLog.filter(x => x.screening_result !== 'allowed').length;
  const allowedCount = callLog.filter(x => x.screening_result === 'allowed').length;
  const firstName = user?.display_name?.split(' ')[0];

  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.6] });
  const glowScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

  const selected = selectedCall ? describeCall(selectedCall) : null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={c.surfaceContainerLowest} />

      {/* Ambient radial glows */}
      <View pointerEvents="none" style={styles.ambientTop} />
      <View pointerEvents="none" style={styles.ambientRight} />

      {/* TopAppBar */}
      <View style={styles.topBar}>
        <View style={styles.brandRow}>
          <View style={styles.logoBox}>
            <Symbol name="shield" size={20} color={c.primary} />
          </View>
          <View>
            <Text style={styles.brandTitle}>ShieldCall</Text>
            <Text style={styles.brandSub}>TELECOM DEFENSE</Text>
          </View>
        </View>
        <TouchableOpacity
          accessibilityLabel="Sync network database"
          style={styles.syncBtn}
          onPress={handleRefresh}
          disabled={refreshing}>
          <Animated.View style={{ transform: [{ rotate }] }}>
            <Symbol name="sync" size={22} color={c.onSurfaceVariant} />
          </Animated.View>
        </TouchableOpacity>
      </View>

      <FlatList
        data={callLog}
        keyExtractor={(item, i) => `${item.phone_number}-${i}`}
        renderItem={renderCallItem}
        contentContainerStyle={styles.scroll}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing || isSyncing}
            onRefresh={handleRefresh}
            tintColor={c.primaryContainer}
            colors={[c.primaryContainer]}
            progressBackgroundColor={c.surfaceContainer}
          />
        }
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            {/* Greeting & live sync capsule */}
            <View style={styles.greetingRow}>
              <View style={{ flex: 1 }}>
                <Text style={[t.headlineMd, { color: c.onSurface }]}>
                  Hey{firstName ? `, ${firstName}` : ''}! 👋
                </Text>
                <Text style={[t.bodySm, { color: c.outline, marginTop: 2 }]}>
                  Telecom perimeter protected
                </Text>
              </View>
              <View style={styles.syncCapsule}>
                <View style={styles.syncDot} />
                <Text style={[t.labelBadge, { fontSize: 10, color: c.onSurfaceVariant }]}>
                  {lastSyncAt
                    ? `Synced ${lastSyncAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase()}`
                    : 'Not synced'}
                </Text>
              </View>
            </View>

            {/* Hero status shield card */}
            {(() => {
              const isEffectiveActive = roleGranted && !isScreeningPaused;
              const handleToggleScreening = (turnOn: boolean) => {
                if (turnOn) {
                  if (!roleGranted) {
                    requestScreeningRole();
                  } else {
                    setScreeningPaused(false);
                  }
                } else {
                  // User wants to turn off screening
                  Alert.alert(
                    'Pause Call Screening?',
                    'You can temporarily pause on-device filtering or revoke default app permissions in Android Settings.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Pause Filtering',
                        style: 'destructive',
                        onPress: () => setScreeningPaused(true),
                      },
                      {
                        text: 'Android Settings',
                        onPress: () => {
                          try {
                            Linking.sendIntent('android.settings.MANAGE_DEFAULT_APPS_SETTINGS');
                          } catch {
                            Linking.openSettings();
                          }
                        },
                      },
                    ],
                  );
                }
              };

              return (
                <View style={styles.heroCard}>
                  <View pointerEvents="none" style={styles.heroHaloTR} />
                  <View pointerEvents="none" style={styles.heroHaloBL} />

                  <View style={styles.heroTop}>
                    <Badge
                      label={
                        isEffectiveActive
                          ? 'ON-DEVICE GUARD'
                          : isScreeningPaused
                          ? 'GUARD PAUSED'
                          : 'GUARD INACTIVE'
                      }
                      color={
                        isEffectiveActive
                          ? c.secondary
                          : isScreeningPaused
                          ? '#f59e0b'
                          : c.error
                      }
                      icon="security"
                      fillAlpha={0.15}
                    />
                    <StitchToggle
                      value={isEffectiveActive}
                      activeColor={c.secondary}
                      onChange={handleToggleScreening}
                    />
                  </View>

                  <View style={styles.heroBody}>
                    <View>
                      <Animated.View
                        pointerEvents="none"
                        style={[
                          styles.heroGlow,
                          {
                            backgroundColor: isEffectiveActive
                              ? c.secondary
                              : isScreeningPaused
                              ? '#f59e0b'
                              : c.error,
                            opacity: glowOpacity,
                            transform: [{ scale: glowScale }],
                          },
                        ]}
                      />
                      <View
                        style={[
                          styles.heroIconBox,
                          {
                            borderColor: a(
                              isEffectiveActive
                                ? c.secondary
                                : isScreeningPaused
                                ? '#f59e0b'
                                : c.error,
                              0.5,
                            ),
                          },
                        ]}
                      >
                        <Symbol
                          name={
                            isEffectiveActive
                              ? 'verified_user'
                              : isScreeningPaused
                              ? 'pause_circle'
                              : 'gpp_bad'
                          }
                          size={30}
                          color={
                            isEffectiveActive
                              ? c.secondary
                              : isScreeningPaused
                              ? '#f59e0b'
                              : c.error
                          }
                          filled
                        />
                      </View>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[t.headlineSm, { color: c.onSurface }]}>
                        {isEffectiveActive
                          ? 'Spam Screening Active'
                          : isScreeningPaused
                          ? 'Screening Paused'
                          : 'Screening Not Granted'}
                      </Text>
                      <Text style={[t.bodySm, { color: c.outline, marginTop: 2 }]}>
                        {isEffectiveActive
                          ? 'Incoming calls are being screened in real-time by on-device AI.'
                          : isScreeningPaused
                          ? 'ShieldCall filtering is paused. Tap the toggle switch to resume protection.'
                          : 'Turn on the switch to grant Android Call Screening permission.'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.heroFooter}>
                    <View style={styles.inlineRow}>
                      <Symbol
                        name="memory"
                        size={14}
                        color={isEffectiveActive ? c.secondary : c.outline}
                      />
                      <Text style={[t.labelBadge, { color: c.outline }]}>
                        Neural Engine: {isEffectiveActive ? 'Active' : isScreeningPaused ? 'Paused' : 'Idle'}
                      </Text>
                    </View>
                    <View style={styles.inlineRow}>
                      <View style={styles.tinyDot} />
                      <Text style={[t.labelBadge, { color: isEffectiveActive ? c.secondary : c.outline }]}>0ms Latency</Text>
                    </View>
                  </View>
                </View>
              );
            })()}

            {/* Daily metrics bento */}
            <View style={styles.metricsRow}>
              <MetricCard label="Screened" icon="filter_alt" value={screenedToday} caption="Today Total" color={c.primary} labelColor={c.outline} valueColor={c.onSurface} />
              <MetricCard label="Blocked" icon="block" value={blockedCount} caption="Threats Cut" color={c.error} />
              <MetricCard label="Allowed" icon="call" value={allowedCount} caption="Safe Routed" color={c.secondary} />
            </View>

            {/* Feed header */}
            <View style={styles.feedHeader}>
              <View style={styles.inlineRow}>
                <Text style={[t.headlineSm, { color: c.onSurface }]}>Recent Screened Calls</Text>
                <View style={styles.newPill}>
                  <Text style={[t.labelBadge, { color: c.onSurfaceVariant }]}>{screenedToday} NEW</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.inlineRow} onPress={() => navigation.navigate('SpamLogs')}>
                <Text style={[t.bodySm, { color: c.primary, fontFamily: fonts.manrope600 }]}>View All</Text>
                <Symbol name="chevron_right" size={14} color={c.primary} />
              </TouchableOpacity>
            </View>
          </>
        }
        ListFooterComponent={
          callLog.length > 0 ? (
            <Text style={[t.bodySm, styles.helper]}>💡 Tap or long-press any call for quick actions</Text>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <IconNode icon="verified_user" color={c.secondary} size={56} radius={16} iconSize={28} filled />
            <Text style={[t.headlineSm, { color: c.onSurface, marginTop: 12 }]}>Perimeter Clear</Text>
            <Text style={[t.bodySm, { color: c.outline, marginTop: 4 }]}>No screened calls yet.</Text>
          </View>
        }
      />

      <CallActionSheet
        visible={!!selectedCall}
        phone={selectedCall?.phone_number ?? ''}
        meta={
          selectedCall
            ? `${detectCarrier(selectedCall.phone_number)} • ${selected?.kind === 'allowed' ? 'Allowed Call' : selected?.badge}`
            : ''
        }
        threat={selected?.kind !== 'allowed'}
        onClose={() => setSelectedCall(null)}
        onBlock={handleBlock}
        onReport={handleReport}
        onWhitelist={handleWhitelist}
      />
    </SafeAreaView>
  );
}

function MetricCard({
  label,
  icon,
  value,
  caption,
  color,
  labelColor,
  valueColor,
}: {
  label: string;
  icon: string;
  value: number;
  caption: string;
  color: string;
  labelColor?: string;
  valueColor?: string;
}) {
  return (
    <View style={[styles.metricCard, { shadowColor: color }]}>
      <View style={styles.metricTop}>
        <Text style={[t.labelCaption, styles.metricLabel, { color: labelColor ?? color }]}>
          {label.toUpperCase()}
        </Text>
        <Symbol name={icon} size={14} color={color} />
      </View>
      <View style={{ marginTop: 8 }}>
        <Text style={[t.headlineMd, { color: valueColor ?? color }]}>{value}</Text>
        <Text style={[t.labelCaption, { color: labelColor ? color : a(color, 0.8) }]}>{caption}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: c.surfaceContainerLowest },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: c.surfaceContainerLowest },
  scroll: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 },

  ambientTop: {
    position: 'absolute',
    top: -140,
    alignSelf: 'center',
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: a(c.primaryContainer, 0.07),
  },
  ambientRight: {
    position: 'absolute',
    top: 200,
    right: -110,
    width: 256,
    height: 256,
    borderRadius: 128,
    backgroundColor: a(c.secondary, 0.04),
  },

  topBar: {
    height: 64,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: c.surfaceContainer,
    borderWidth: 1,
    borderColor: a(c.outlineVariant, 0.4),
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: { ...t.headlineSm, color: c.onSurface, lineHeight: 20 },
  brandSub: { ...t.labelBadge, fontSize: 9, color: c.outline, letterSpacing: 1.8, marginTop: 1 },
  syncBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: c.surfaceContainerLow,
    borderWidth: 1,
    borderColor: a(c.outlineVariant, 0.3),
    alignItems: 'center',
    justifyContent: 'center',
  },

  greetingRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 4, paddingBottom: 16 },
  syncCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: c.surfaceContainerLow,
    borderWidth: 1,
    borderColor: a(c.outlineVariant, 0.3),
  },
  syncDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.secondary },

  heroCard: {
    borderRadius: 16,
    backgroundColor: c.surfaceContainerLow,
    borderWidth: 1,
    borderColor: a(c.outlineVariant, 0.4),
    padding: 20,
    overflow: 'hidden',
    marginBottom: 16,
    gap: 16,
    elevation: 10,
    shadowColor: '#000',
  },
  heroHaloTR: {
    position: 'absolute',
    top: -30,
    right: -30,
    width: 144,
    height: 144,
    borderRadius: 72,
    backgroundColor: a(c.secondary, 0.08),
  },
  heroHaloBL: {
    position: 'absolute',
    bottom: -20,
    left: -20,
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: a(c.primary, 0.05),
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroBody: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingTop: 4 },
  heroGlow: {
    position: 'absolute',
    top: -6,
    left: -6,
    width: 68,
    height: 68,
    borderRadius: 22,
  },
  heroIconBox: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: c.surfaceContainerLowest,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroFooter: {
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: a(c.outlineVariant, 0.3),
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tinyDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.secondary },

  metricsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  metricCard: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: c.surfaceContainerLow,
    borderWidth: 1,
    borderColor: a(c.outlineVariant, 0.3),
    padding: 12,
    elevation: 3,
  },
  metricTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metricLabel: { fontFamily: fonts.mono600, letterSpacing: 0.8 },

  feedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    marginBottom: 12,
  },
  newPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: c.surfaceContainerHigh,
  },

  callCard: {
    borderRadius: 16,
    backgroundColor: c.surfaceContainerLow,
    borderWidth: 1,
    borderColor: a(c.outlineVariant, 0.3),
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  callLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, marginRight: 8 },
  callPhone: { fontFamily: fonts.grotesk700, fontSize: 16, lineHeight: 22, color: c.onSurface },
  callRight: { alignItems: 'flex-end', gap: 4 },

  helper: { color: c.outline, textAlign: 'center', paddingTop: 12, paddingBottom: 4 },
  empty: { alignItems: 'center', paddingVertical: 40 },
});
