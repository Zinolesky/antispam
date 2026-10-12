/**
 * SpamLogsScreen — Spam Logs & Search (ShieldCall Threat Telemetry).
 * Mirrors design/stitch/.../spam_logs_search/code.html.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { stitchAlert as Alert } from '../components/StitchAlert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  getCallLog,
  CallLogEntry,
  addToBlockList,
  removeFromBlockList,
  getLastDeltaId,
  getBlockedPrefixes,
  BlockedPrefixEntry,
} from '@services/DatabaseService';
import { Badge, CallActionSheet, IconNode, Symbol } from '../components/stitch';
import { a, c, fonts, t } from '../theme/stitch';
import { detectCarrier, isLagosVoip, timeAgo } from '../utils/carrier';

type Filter = 'all' | 'rejected' | 'silenced' | 'allowed' | 'voip';

function formatWhen(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return `Today, ${time}`;
  return timeAgo(iso);
}

export default function SpamLogsScreen() {
  const navigation = useNavigation<any>();
  const [logs, setLogs] = useState<CallLogEntry[]>([]);
  const [prefixes, setPrefixes] = useState<BlockedPrefixEntry[]>([]);
  const [cursor, setCursor] = useState(0);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<Filter>('all');
  const [selectedCall, setSelectedCall] = useState<CallLogEntry | null>(null);

  const loadLogs = useCallback(async () => {
    const [data, pfx, cur] = await Promise.all([getCallLog(500), getBlockedPrefixes(), getLastDeltaId()]);
    setLogs(data);
    setPrefixes(pfx);
    setCursor(cur);
  }, []);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  useFocusEffect(
    useCallback(() => {
      loadLogs();
    }, [loadLogs]),
  );

  const filtered = useMemo(() => {
    let result = logs;
    if (activeFilter === 'voip') result = result.filter(l => isLagosVoip(l.phone_number));
    else if (activeFilter !== 'all') result = result.filter(l => l.screening_result === activeFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(
        l => l.phone_number.toLowerCase().includes(q) || detectCarrier(l.phone_number).toLowerCase().includes(q),
      );
    }
    return result;
  }, [logs, activeFilter, search]);

  const counts = {
    all: logs.length,
    rejected: logs.filter(l => l.screening_result === 'rejected').length,
    silenced: logs.filter(l => l.screening_result === 'silenced').length,
    allowed: logs.filter(l => l.screening_result === 'allowed').length,
    voip: logs.filter(l => isLagosVoip(l.phone_number)).length,
  };

  const matchPrefix = (num: string) => {
    const local = num.startsWith('+234') ? '0' + num.slice(4) : num;
    return prefixes.find(p => local.startsWith(p.prefix) || num.startsWith(p.prefix));
  };

  const handleBlock = async () => {
    if (!selectedCall) return;
    const phone = selectedCall.phone_number;
    setSelectedCall(null);
    await addToBlockList({ phone_number: phone, label: 'Blocked from Spam Logs' });
    await loadLogs();
    Alert.alert('Number Blacklisted', `Calls from ${phone} will now be rejected automatically.`);
  };

  const handleWhitelist = async () => {
    if (!selectedCall) return;
    const phone = selectedCall.phone_number;
    setSelectedCall(null);
    await removeFromBlockList(phone);
    await loadLogs();
    Alert.alert('Added to Verified Safe List', `Calls from ${phone} will now be allowed.`);
  };

  const handleReport = () => {
    if (!selectedCall) return;
    const phone = selectedCall.phone_number;
    setSelectedCall(null);
    navigation.navigate('Report', { prefillNumber: phone });
  };

  const handleExport = () => {
    const lines = filtered
      .slice(0, 100)
      .map(l => `${l.called_at}  ${l.phone_number}  ${l.screening_result.toUpperCase()}${l.spam_score != null ? `  ${l.spam_score}%` : ''}`);
    Share.share({ message: `ShieldCall Threat Log (${filtered.length} entries)\n\n${lines.join('\n')}` });
  };

  // Inspection card: shown for the top match while searching.
  const inspected = search.trim() ? filtered[0] : undefined;
  const inspectedHits = inspected ? logs.filter(l => l.phone_number === inspected.phone_number).length : 0;
  const inspectedThreat = inspected ? inspected.screening_result !== 'allowed' : false;

  const renderItem = ({ item }: { item: CallLogEntry }) => {
    const rule = matchPrefix(item.phone_number);
    const score = item.spam_score;
    let icon = 'check_circle';
    let color = c.secondary;
    let badge = 'Verified Safe';
    let footIcon = 'verified';
    let footText = 'Passed on-device screening';
    let footRight = 'ALLOWLIST';
    let footRightColor = c.secondary;
    let footIconColor = c.secondary;

    if (item.screening_result === 'silenced') {
      icon = 'volume_off';
      color = c.tertiary;
      badge = 'Auto-Silenced';
      footIcon = 'smart_toy';
      footIconColor = c.tertiary;
      footText = 'Silenced to voicemail';
      footRight = score != null ? `SCORE ${score}` : 'SCREENED';
      footRightColor = c.outline;
    } else if (item.screening_result === 'rejected') {
      color = c.error;
      if (rule) {
        icon = 'block';
        badge = 'Prefix Blocked';
        footIcon = 'filter_alt';
        footIconColor = c.outline;
        footText = `Blocked via rule ${rule.prefix}*`;
        footRight = `RULE ${rule.prefix.slice(-3)}`;
        footRightColor = c.outline;
      } else if (!item.phone_number.startsWith('+234') && item.phone_number.startsWith('+')) {
        icon = 'public_off';
        badge = 'Spoofed VoIP';
        footIcon = 'phone_callback';
        footIconColor = c.error;
        footText = 'International caller rejected';
        footRight = 'HIGH RISK';
        footRightColor = c.error;
      } else {
        icon = 'phone_disabled';
        badge = `${score ?? 100}% Scam Risk`;
        footIcon = 'report';
        footIconColor = c.error;
        footText = 'Rejected by your blocklist';
        footRight = 'BLOCKED';
        footRightColor = c.error;
      }
    }

    return (
      <TouchableOpacity
        activeOpacity={0.8}
        style={[styles.logCard, { shadowColor: color }]}
        onPress={() => setSelectedCall(item)}
        onLongPress={() => setSelectedCall(item)}
        delayLongPress={180}>
        <View style={styles.logTop}>
          <View style={styles.logLeft}>
            <View style={{ marginTop: 2 }}>
              <IconNode
                icon={icon}
                color={color}
                size={40}
                radius={12}
                iconSize={20}
                background={color === c.secondary ? a(c.secondaryContainer, 0.2) : a(color === c.error ? c.errorContainer : c.tertiaryContainer, 0.3)}
              />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={[styles.inline, { flexShrink: 1 }]}>
                <Text style={[t.headlineSm, { color: c.onSurface, flexShrink: 1 }]} numberOfLines={1}>
                  {item.phone_number}
                </Text>
                {item.screening_result === 'rejected' && !rule && (
                  <Symbol name="info" size={16} color={c.outline} />
                )}
              </View>
              <Text style={[t.bodySm, { color: c.outline }]} numberOfLines={1}>
                {detectCarrier(item.phone_number)} • {formatWhen(item.called_at)}
              </Text>
            </View>
          </View>
          <Badge
            label={badge}
            color={color}
            fillAlpha={0.12}
            style={{ paddingHorizontal: 10, paddingVertical: 4, flexShrink: 0 }}
          />
        </View>
        <View style={styles.logFoot}>
          <View style={[styles.inline, { flex: 1 }]}>
            <Symbol name={footIcon} size={16} color={footIconColor} />
            <Text style={[t.bodySm, { color: c.onSurfaceVariant, flex: 1 }]} numberOfLines={1}>
              {footText}
            </Text>
          </View>
          <Text
            style={[
              t.labelCode,
              { color: footRightColor },
              footRightColor === c.error && { fontFamily: fonts.mono600 },
            ]}>
            {footRight}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const FILTERS: { id: Filter; label: string; color: string; container: string }[] = [
    { id: 'rejected', label: 'Blocked', color: c.error, container: c.errorContainer },
    { id: 'silenced', label: 'Silenced', color: c.tertiary, container: c.tertiaryContainer },
    { id: 'allowed', label: 'Allowed', color: c.secondary, container: c.secondaryContainer },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Telemetry strip */}
      <View style={styles.strip}>
        <View style={styles.inline}>
          <View style={styles.radarDot} />
          <Text style={[t.labelBadge, { color: c.outline }]}>AI RADAR ACTIVE</Text>
        </View>
        <Text style={[t.labelBadge, { color: c.outline, letterSpacing: 1.6 }]}>LAGOS GATEWAY // SECURE</Text>
      </View>

      {/* Header */}
      <View style={styles.header}>
        <View style={[styles.inline, { gap: 12 }]}>
          <TouchableOpacity
            accessibilityLabel="Go back"
            style={styles.headerBtn}
            onPress={() => navigation.navigate('Home')}>
            <Symbol name="arrow_back" size={20} color={c.onSurface} />
          </TouchableOpacity>
          <View>
            <Text style={[t.headlineSm, { color: c.onSurface }]}>Spam Logs &amp; Search</Text>
            <Text style={[t.labelCaption, { color: c.outline }]}>ShieldCall Threat Telemetry</Text>
          </View>
        </View>
        <TouchableOpacity accessibilityLabel="Export Logs" style={styles.headerBtn} onPress={handleExport}>
          <Symbol name="ios_share" size={20} color={c.outlineVariant} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item, i) => `${item.phone_number}-${item.called_at}-${i}`}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: 16, marginBottom: 12 }}>
            {/* Search */}
            <View style={styles.search}>
              <Symbol name="search" size={20} color={c.outline} style={{ marginLeft: 14, marginRight: 8 }} />
              <TextInput
                id="spam-logs-search"
                style={[t.bodyMd, styles.searchInput]}
                placeholder="Search number, carrier or Lagos prefix (e.g. 0201)..."
                placeholderTextColor={a(c.outline, 0.6)}
                value={search}
                onChangeText={setSearch}
              />
              {search.length > 0 && (
                <TouchableOpacity accessibilityLabel="Clear Search" onPress={() => setSearch('')} style={{ paddingHorizontal: 14 }}>
                  <Symbol name="cancel" size={18} color={c.outline} />
                </TouchableOpacity>
              )}
            </View>

            {/* Filter pills */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
              <TouchableOpacity
                style={[styles.pill, activeFilter === 'all' ? styles.pillAllActive : styles.pillNeutral]}
                onPress={() => setActiveFilter('all')}>
                <Text style={[t.labelBadge, { color: activeFilter === 'all' ? c.onPrimaryFixed : c.onSurfaceVariant, fontFamily: fonts.mono700 }]}>All</Text>
                <View style={[styles.pillCount, { backgroundColor: activeFilter === 'all' ? a(c.surfaceContainerLowest, 0.2) : c.surfaceContainerHighest }]}>
                  <Text style={[t.labelBadge, { color: activeFilter === 'all' ? c.onPrimaryFixed : c.outline }]}>{counts.all}</Text>
                </View>
              </TouchableOpacity>

              {FILTERS.map(f => {
                const active = activeFilter === f.id;
                return (
                  <TouchableOpacity
                    key={f.id}
                    style={[
                      styles.pill,
                      {
                        backgroundColor: a(f.container, active ? 0.45 : 0.2),
                        borderColor: active ? f.color : a(f.color, 0.5),
                        borderWidth: 1,
                      },
                    ]}
                    onPress={() => setActiveFilter(active ? 'all' : f.id)}>
                    <View style={[styles.pillDot, { backgroundColor: f.color }]} />
                    <Text style={[t.labelBadge, { color: f.color }]}>{f.label}</Text>
                    <View style={[styles.pillCount, { backgroundColor: a(f.container, 0.4) }]}>
                      <Text style={[t.labelBadge, { color: f.color }]}>{counts[f.id as 'rejected' | 'silenced' | 'allowed']}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}

              <TouchableOpacity
                style={[
                  styles.pill,
                  styles.pillNeutral,
                  activeFilter === 'voip' && { borderColor: c.primaryContainer },
                ]}
                onPress={() => setActiveFilter(activeFilter === 'voip' ? 'all' : 'voip')}>
                <Symbol name="router" size={14} color={c.primary} />
                <Text style={[t.labelBadge, { color: c.onSurfaceVariant }]}>Lagos VoIP</Text>
                <View style={[styles.pillCount, { backgroundColor: c.surfaceContainerHighest }]}>
                  <Text style={[t.labelBadge, { color: c.outline }]}>{counts.voip}</Text>
                </View>
              </TouchableOpacity>
            </ScrollView>

            {/* Inspection card */}
            {inspected && (
              <View style={styles.inspect}>
                <View pointerEvents="none" style={styles.inspectGlow} />
                <View style={styles.inspectTop}>
                  <View style={[styles.inline, { flex: 1 }]}>
                    <View style={styles.protocolTag}>
                      <Text style={[t.labelBadge, { color: c.error }]}>INSPECTION PROTOCOL</Text>
                    </View>
                    <Text style={[t.labelCode, { color: c.outline }]} numberOfLines={1}>
                      ROUTE: {inspected.phone_number.replace(/\s/g, '')}
                    </Text>
                  </View>
                  <Symbol name="verified_user" size={18} color={c.outline} />
                </View>
                <View style={styles.bento}>
                  <View style={styles.bentoCell}>
                    <Text style={[t.labelCaption, styles.bentoLabel]}>CARRIER INFRASTRUCTURE</Text>
                    <View style={styles.inline}>
                      <Symbol name="cell_tower" size={14} color={c.secondary} />
                      <Text style={[t.bodySm, { color: c.onSurface, fontFamily: fonts.manrope600 }]}>
                        {detectCarrier(inspected.phone_number)}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.bentoCell}>
                    <Text style={[t.labelCaption, styles.bentoLabel]}>REPUTATION SCORE</Text>
                    <View style={styles.inline}>
                      <Symbol
                        name={inspectedThreat ? 'warning' : 'check_circle'}
                        size={14}
                        color={inspectedThreat ? c.error : c.secondary}
                      />
                      <Text
                        style={[
                          t.bodySm,
                          { color: inspectedThreat ? c.error : c.secondary, fontFamily: fonts.manrope700 },
                        ]}>
                        {inspectedThreat
                          ? (inspected.spam_score ?? 100) >= 90
                            ? 'Highly Malicious'
                            : 'Suspicious'
                          : 'Trusted'}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.bentoCell, styles.bentoWide]}>
                    <View>
                      <Text style={[t.labelCaption, styles.bentoLabel]}>LOCAL INCIDENT LOG</Text>
                      <Text style={[t.bodySm, { color: c.onSurface }]}>On-device screening history</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[t.headlineSm, { color: c.primary }]}>{inspectedHits}</Text>
                      <Text style={[t.labelCaption, { color: c.outline }]}>Screened calls</Text>
                    </View>
                  </View>
                </View>
              </View>
            )}

            {/* Feed header */}
            <View style={[styles.feedHeader]}>
              <Text style={[t.headlineSm, { color: c.onSurface }]}>Recent Threat Stream</Text>
              <Text style={[t.labelCaption, { color: c.outline, letterSpacing: 1 }]}>
                FILTERED: {activeFilter === 'all' ? 'ALL' : activeFilter === 'voip' ? 'LAGOS VOIP' : activeFilter === 'rejected' ? 'BLOCKED' : activeFilter.toUpperCase()}
              </Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <IconNode icon="verified_user" color={c.primary} size={56} radius={16} iconSize={28} />
            <Text style={[t.headlineSm, { color: c.onSurface, marginTop: 12 }]}>No matching logs</Text>
            <Text style={[t.bodySm, { color: c.outline, marginTop: 4 }]}>No calls match the current filter</Text>
          </View>
        }
        ListFooterComponent={
          <View style={styles.revision}>
            <View style={styles.inline}>
              <Symbol name="security_update_good" size={16} color={c.primary} />
              <Text style={[t.labelBadge, { color: c.outline }]}>DATABASE REVISION #{cursor.toLocaleString()}</Text>
            </View>
            <Text style={[t.labelCaption, { color: c.primary }]}>{cursor > 0 ? '100% IN SYNC' : 'AWAITING SYNC'}</Text>
          </View>
        }
      />

      <CallActionSheet
        visible={!!selectedCall}
        phone={selectedCall?.phone_number ?? ''}
        meta={
          selectedCall
            ? `${detectCarrier(selectedCall.phone_number)} • ${formatWhen(selectedCall.called_at)} • ${selectedCall.screening_result.toUpperCase()}`
            : ''
        }
        threat={selectedCall?.screening_result !== 'allowed'}
        onClose={() => setSelectedCall(null)}
        onBlock={handleBlock}
        onReport={handleReport}
        onWhitelist={handleWhitelist}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: c.surfaceContainerLowest },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  strip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  radarDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.secondaryContainer },
  header: {
    height: 64,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: c.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 },

  search: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    borderRadius: 12,
    backgroundColor: c.surfaceContainerLow,
    borderWidth: 1,
    borderColor: a(c.outlineVariant, 0.3),
  },
  searchInput: { flex: 1, color: c.onSurface, paddingVertical: 0 },

  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  pillAllActive: { backgroundColor: c.primaryContainer, paddingHorizontal: 14, elevation: 6, shadowColor: c.primaryContainer },
  pillNeutral: {
    backgroundColor: c.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: a(c.outlineVariant, 0.5),
  },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillCount: { paddingHorizontal: 6, borderRadius: 999 },

  inspect: {
    borderRadius: 16,
    padding: 16,
    backgroundColor: c.surfaceContainerLow,
    borderWidth: 1,
    borderColor: a(c.primaryContainer, 0.3),
    overflow: 'hidden',
    elevation: 10,
    shadowColor: '#000',
  },
  inspectGlow: {
    position: 'absolute',
    top: -48,
    right: -48,
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: a(c.primaryContainer, 0.1),
  },
  inspectTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 },
  protocolTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: a(c.errorContainer, 0.3),
    borderWidth: 1,
    borderColor: a(c.error, 0.4),
  },
  bento: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingTop: 4 },
  bentoCell: {
    flexGrow: 1,
    flexBasis: '45%',
    padding: 10,
    borderRadius: 12,
    backgroundColor: a(c.surfaceContainer, 0.7),
    borderWidth: 1,
    borderColor: a(c.outlineVariant, 0.2),
  },
  bentoWide: { flexBasis: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bentoLabel: { color: c.outline, marginBottom: 4 },

  feedHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8 },

  logCard: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: c.surfaceContainerLow,
    borderWidth: 1,
    borderColor: a(c.outlineVariant, 0.3),
    elevation: 3,
  },
  logTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  logLeft: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, flex: 1, minWidth: 0, marginRight: 8 },
  logFoot: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: a(c.outlineVariant, 0.2),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },

  revision: {
    marginTop: 16,
    padding: 14,
    borderRadius: 12,
    backgroundColor: c.surfaceContainer,
    borderWidth: 1,
    borderColor: a(c.outlineVariant, 0.3),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  empty: { alignItems: 'center', paddingVertical: 40 },
});
