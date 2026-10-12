/**
 * ReportScreen — Community Threat Intelligence.
 * Mirrors design/stitch/.../report_spam_number/code.html.
 */
import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { stitchAlert as Alert } from '../components/StitchAlert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ReportsAPI } from '@services/ApiService';
import { addToBlockList, getCallLog } from '@services/DatabaseService';
import { syncOnce } from '@services/SyncService';
import { useAppStore } from '@store/useAppStore';
import { isValidPhoneNumber, normalizePhoneNumber } from '../utils/phoneUtils';
import { detectCarrier } from '../utils/carrier';
import { Badge, Symbol } from '../components/stitch';
import { a, c, fonts, t } from '../theme/stitch';

type ApiCategory = 'robocall' | 'telemarketer' | 'scam' | 'unknown';

const CLASSIFICATIONS: {
  api: ApiCategory;
  title: string;
  subtitle: string;
  icon: string;
  critical?: boolean;
}[] = [
  { api: 'robocall', title: 'Robocall / Automated Dialer', subtitle: 'Pre-recorded telecom IVR broadcast', icon: 'smart_toy' },
  { api: 'telemarketer', title: 'Telemarketer / Aggressive Sales', subtitle: 'Unsolicited commercial cold calls', icon: 'phone_in_talk' },
  { api: 'scam', title: 'Financial Scam / Phishing', subtitle: 'BVN, POS terminal, or fake credit alert', icon: 'account_balance', critical: true },
  { api: 'scam', title: 'Impersonation / Fraud', subtitle: 'EFCC, Customs, or family emergency', icon: 'theater_comedy' },
  { api: 'scam', title: 'Fake Loan App Harassment', subtitle: 'Defamatory SMS, blacklist threats, unauthorized contact raiding', icon: 'price_change' },
];

interface Props {
  route?: { params?: { prefillNumber?: string } };
}

export default function ReportScreen({ route }: Props) {
  const { setSyncStatus } = useAppStore();
  const [phoneNumber, setPhoneNumber] = useState(route?.params?.prefillNumber ?? '');
  const [selected, setSelected] = useState(2);
  const [callerName, setCallerName] = useState('');
  const [notes, setNotes] = useState('');
  const [blockImmediately, setBlockImmediately] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [flags24h, setFlags24h] = useState<number | null>(null);

  // Keep the field in sync when navigated here with a new prefill number.
  useEffect(() => {
    if (route?.params?.prefillNumber) setPhoneNumber(route.params.prefillNumber);
  }, [route?.params?.prefillNumber]);

  // Live community lookup (requires a signed-in account; silently hidden otherwise).
  useEffect(() => {
    setFlags24h(null);
    const raw = phoneNumber.trim();
    if (!isValidPhoneNumber(raw)) return;
    const handle = setTimeout(async () => {
      try {
        const res = await ReportsAPI.getForNumber(normalizePhoneNumber(raw));
        const cutoff = Date.now() - 24 * 3600 * 1000;
        const list = (res.data ?? []) as Array<{ created_at: string }>;
        setFlags24h(list.filter(r => new Date(r.created_at).getTime() >= cutoff).length);
      } catch {
        setFlags24h(null);
      }
    }, 450);
    return () => clearTimeout(handle);
  }, [phoneNumber]);

  const useLastScreened = async () => {
    const [last] = await getCallLog(1);
    if (last) setPhoneNumber(last.phone_number);
    else Alert.alert('No recent calls', 'There are no screened calls to use yet.');
  };

  const handleSubmit = async () => {
    const raw = phoneNumber.trim();
    if (!raw) {
      Alert.alert('Error', 'Please enter a target phone number');
      return;
    }
    if (!isValidPhoneNumber(raw)) {
      Alert.alert('Invalid Format', 'Please enter a valid phone number, such as 08162051907 or +2348162051907.');
      return;
    }
    const normalized = normalizePhoneNumber(raw);
    const cls = CLASSIFICATIONS[selected];
    const composedNotes = [
      cls.title,
      callerName.trim() ? `Claimed: ${callerName.trim()}` : '',
      notes.trim(),
    ]
      .filter(Boolean)
      .join(' | ');

    setSubmitting(true);
    try {
      if (blockImmediately) {
        await addToBlockList({ phone_number: normalized, label: cls.title });
      }
      await ReportsAPI.submit(normalized, cls.api, composedNotes);
      Alert.alert(
        'Report Submitted',
        blockImmediately
          ? `${normalized} is now BLOCKED on this device. Future calls will be terminated without ringing.`
          : 'Thank you! Your report helps protect the community.',
        [
          {
            text: 'OK',
            onPress: () => {
              setPhoneNumber('');
              setCallerName('');
              setNotes('');
            },
          },
        ],
      );
    } catch (error: unknown) {
      const msg =
        (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'Failed to submit report. Please check your connection.';
      Alert.alert('Submission Error', typeof msg === 'string' ? msg : 'Failed to submit report.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSync = async () => {
    setSyncStatus({ syncing: true });
    try {
      const r = await syncOnce();
      setSyncStatus({ lastSyncAt: new Date(), deltasCount: r.deltasApplied, syncing: false });
      Alert.alert('Threat Feed Synced', `Applied ${r.deltasApplied} new spam records.`);
    } catch {
      setSyncStatus({ syncing: false });
      Alert.alert('Sync Failed', 'Could not reach the threat feed.');
    }
  };

  const validNumber = isValidPhoneNumber(phoneNumber.trim());

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* TopAppBar */}
      <View style={styles.topBar}>
        <View style={styles.inline}>
          <View style={{ padding: 8 }}>
            <Symbol name="shield" size={24} color={c.primary} />
          </View>
          <Text style={[t.headlineSm, { color: c.onSurface }]}>ShieldCall</Text>
        </View>
        <View style={styles.inline}>
          <Badge label="DEFENSE ACTIVE" color={c.secondary} dot />
          <TouchableOpacity accessibilityLabel="Sync Threat Feed" style={{ padding: 8 }} onPress={handleSync}>
            <Symbol name="sync" size={22} color={c.onSurfaceVariant} />
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={{ gap: 4 }}>
            <View style={styles.inline}>
              <Symbol name="gpp_maybe" size={20} color={c.primary} />
              <Text style={[t.headlineMd, { color: c.onSurface, flex: 1 }]}>Community Threat Intelligence</Text>
            </View>
            <Text style={[t.bodyMd, { color: c.onSurfaceVariant }]}>
              Help protect 250,000+ Nigerian mobile users from fraud
            </Text>
          </View>

          {/* Zero-knowledge banner */}
          <View style={styles.zkBanner}>
            <View style={styles.zkIcon}>
              <Symbol name="verified_user" size={18} color={c.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[t.labelCode, { color: c.primary }]}>Zero-Knowledge Reporting</Text>
              <Text style={[t.bodySm, { color: c.outline }]}>
                Your phone number and subscriber identity stay completely anonymous
              </Text>
            </View>
            <Symbol name="lock" size={18} color={c.outline} />
          </View>

          {/* Phone input */}
          <View style={[styles.card, { gap: 12 }]}>
            <Text style={[t.labelCode, styles.label]}>TARGET PHONE NUMBER</Text>
            <View style={styles.phoneField}>
              <View style={styles.country}>
                <Text style={{ fontSize: 16 }}>🇳🇬</Text>
                <Text style={[t.labelBadge, { color: c.onSurface }]}>+234</Text>
                <Symbol name="arrow_drop_down" size={16} color={c.outline} />
              </View>
              <View style={styles.vDivider} />
              <TextInput
                id="report-phone-input"
                style={[t.labelCode, styles.phoneInput]}
                placeholder="0803 000 0000 or +234..."
                placeholderTextColor={c.outline}
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                keyboardType="phone-pad"
                autoCorrect={false}
              />
              <TouchableOpacity
                accessibilityLabel="Use last screened number"
                style={{ padding: 4 }}
                onPress={useLastScreened}>
                <Symbol name="content_paste" size={18} color={c.outline} />
              </TouchableOpacity>
            </View>
            {validNumber && (
              <View style={styles.lookupRow}>
                {flags24h !== null ? (
                  <View style={styles.flagBadge}>
                    <Symbol name="warning" size={14} color={c.tertiary} />
                    <Text style={[t.labelBadge, { color: c.tertiary }]}>
                      {flags24h} community flag{flags24h === 1 ? '' : 's'} in past 24h
                    </Text>
                  </View>
                ) : (
                  <View />
                )}
                <Text style={[t.bodySm, { color: c.outline }]}>{detectCarrier(phoneNumber.trim())}</Text>
              </View>
            )}
          </View>

          {/* Classification */}
          <View style={{ gap: 12 }}>
            <View style={styles.between}>
              <Text style={[t.labelCode, styles.label]}>SELECT SPAM CLASSIFICATION</Text>
              <Text style={[t.bodySm, { color: c.outline }]}>Single selection</Text>
            </View>
            <View style={{ gap: 10 }} accessibilityRole="radiogroup">
              {CLASSIFICATIONS.map((cls, idx) => {
                const active = idx === selected;
                return (
                  <TouchableOpacity
                    key={cls.title}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    activeOpacity={0.8}
                    style={[styles.option, active && styles.optionActive]}
                    onPress={() => setSelected(idx)}>
                    <View style={[styles.inline, { gap: 12, flex: 1 }]}>
                      <View style={[styles.optionIcon, active && { backgroundColor: a(c.primaryContainer, 0.2) }]}>
                        <Symbol name={cls.icon} size={20} color={active ? c.primary : c.outline} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={styles.inline}>
                          <Text
                            style={[
                              t.bodyMd,
                              { color: c.onSurface, fontFamily: active ? fonts.manrope600 : fonts.manrope500, flexShrink: 1 },
                            ]}>
                            {cls.title}
                          </Text>
                          {cls.critical && (
                            <View style={styles.criticalTag}>
                              <Text style={[t.labelBadge, { fontSize: 9, color: c.error }]}>CRITICAL</Text>
                            </View>
                          )}
                        </View>
                        <Text style={[t.bodySm, { color: active ? c.primary : c.outline }]}>{cls.subtitle}</Text>
                      </View>
                    </View>
                    {active ? (
                      <View style={styles.radioOn}>
                        <Symbol name="check" size={14} color={c.onPrimaryContainer} />
                      </View>
                    ) : (
                      <View style={styles.radioOff} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Incident metadata */}
          <View style={[styles.card, { gap: 16 }]}>
            <View style={styles.between}>
              <Text style={[t.labelCode, styles.label]}>INCIDENT METADATA (OPTIONAL)</Text>
              <Text style={[t.labelBadge, { color: c.outline }]}>AI NLP VERIFIED</Text>
            </View>
            <View style={{ gap: 6 }}>
              <Text style={[t.bodySm, { color: c.onSurfaceVariant }]}>Caller Name or Entity Claimed</Text>
              <View style={styles.inputField}>
                <Symbol name="badge" size={20} color={c.outline} style={{ marginRight: 8 }} />
                <TextInput
                  style={[t.bodyMd, { flex: 1, color: c.onSurface, paddingVertical: 0 }]}
                  placeholder="e.g. Access Bank Helpdesk or Customs Agent"
                  placeholderTextColor={c.outline}
                  value={callerName}
                  onChangeText={setCallerName}
                  maxLength={80}
                />
              </View>
            </View>
            <View style={{ gap: 6 }}>
              <Text style={[t.bodySm, { color: c.onSurfaceVariant }]}>Description / Modus Operandi</Text>
              <TextInput
                id="report-notes-input"
                style={[t.bodyMd, styles.textarea]}
                placeholder="Describe caller pitch, bank impersonation, or threat details..."
                placeholderTextColor={c.outline}
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={3}
                maxLength={400}
                textAlignVertical="top"
              />
            </View>
          </View>

          {/* Local enforcement switch */}
          <View style={styles.enforce}>
            <View style={{ flex: 1, gap: 4 }}>
              <View style={styles.inline}>
                <Symbol name="block" size={20} color={c.secondary} />
                <Text style={[t.headlineSm, { color: c.onSurface, fontFamily: fonts.grotesk600, flex: 1 }]}>
                  Block immediately on this device
                </Text>
              </View>
              <Text style={[t.bodySm, { color: c.onSurfaceVariant }]}>
                Immediately terminates future incoming calls from this caller without ringing
              </Text>
            </View>
            <TouchableOpacity
              accessibilityRole="switch"
              accessibilityState={{ checked: blockImmediately }}
              activeOpacity={0.85}
              onPress={() => setBlockImmediately(v => !v)}
              style={[styles.bigTrack, { backgroundColor: blockImmediately ? c.secondary : c.surfaceContainerHighest }]}>
              <View style={[styles.bigThumb, { transform: [{ translateX: blockImmediately ? 24 : 0 }] }]}>
                {blockImmediately && <Symbol name="check" size={14} color={c.secondary} />}
              </View>
            </TouchableOpacity>
          </View>

          {/* CTA */}
          <TouchableOpacity
            id="submit-report-btn"
            activeOpacity={0.9}
            disabled={submitting}
            onPress={handleSubmit}
            style={[styles.cta, submitting && { opacity: 0.6 }]}>
            <View pointerEvents="none" style={styles.ctaGradientEnd} />
            <Symbol name="shield" size={22} color={c.onPrimary} />
            <Text style={[t.headlineSm, { color: c.onPrimary, fontFamily: fonts.grotesk600 }]}>
              {submitting ? 'Submitting…' : blockImmediately ? 'Submit Report & Block Number' : 'Submit Report'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: c.surfaceContainerLowest },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topBar: {
    height: 64,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scroll: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32, gap: 24 },
  label: { color: c.onSurface, letterSpacing: 0.8 },

  zkBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: a(c.surfaceContainerLow, 0.9),
    borderWidth: 1,
    borderColor: a(c.outlineVariant, 0.4),
  },
  zkIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: a(c.primaryContainer, 0.2),
    borderWidth: 1,
    borderColor: a(c.primary, 0.3),
    alignItems: 'center',
    justifyContent: 'center',
  },

  card: {
    borderRadius: 16,
    padding: 16,
    backgroundColor: c.surfaceContainerLow,
    borderWidth: 1,
    borderColor: a(c.outlineVariant, 0.4),
  },
  phoneField: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    borderRadius: 12,
    backgroundColor: c.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: c.outlineVariant,
    paddingHorizontal: 12,
    gap: 8,
  },
  country: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: c.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: a(c.outlineVariant, 0.5),
  },
  vDivider: { width: 1, height: 24, backgroundColor: a(c.outlineVariant, 0.4) },
  phoneInput: { flex: 1, color: c.onSurface, paddingVertical: 0 },
  lookupRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 },
  flagBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: a(c.tertiary, 0.1),
    borderWidth: 1,
    borderColor: a(c.tertiary, 0.4),
  },

  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 12,
    backgroundColor: c.surfaceContainerLow,
    borderWidth: 1,
    borderColor: a(c.outlineVariant, 0.3),
    gap: 8,
  },
  optionActive: {
    backgroundColor: a(c.surfaceContainerHigh, 0.9),
    borderWidth: 2,
    borderColor: c.primaryContainer,
    elevation: 8,
    shadowColor: '#7c6ff7',
  },
  optionIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: c.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  criticalTag: { paddingHorizontal: 6, borderRadius: 4, backgroundColor: a(c.errorContainer, 0.4) },
  radioOff: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: c.outlineVariant },
  radioOn: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: c.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },

  inputField: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: c.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: c.outlineVariant,
  },
  textarea: {
    minHeight: 84,
    borderRadius: 12,
    padding: 12,
    color: c.onSurface,
    backgroundColor: c.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: c.outlineVariant,
  },

  enforce: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
    borderRadius: 16,
    backgroundColor: c.surfaceContainer,
    borderWidth: 1,
    borderColor: a(c.outlineVariant, 0.6),
  },
  bigTrack: { width: 56, height: 32, borderRadius: 16, padding: 4, justifyContent: 'center' },
  bigThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: c.surfaceContainerLowest,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
  },

  cta: {
    height: 56,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: c.primaryContainer,
    overflow: 'hidden',
    elevation: 10,
    shadowColor: '#7c6ff7',
  },
  // Approximates Tailwind `bg-gradient-to-r from-primary-container to-inverse-primary`.
  ctaGradientEnd: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: '55%',
    backgroundColor: a(c.inversePrimary, 0.55),
  },
});
