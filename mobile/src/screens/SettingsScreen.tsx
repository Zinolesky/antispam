/**
 * SettingsScreen — Shield Settings & Rules (Cloud Sync & Ruleset Engine).
 * Mirrors design/stitch/.../settings_cloud_sync/code.html.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { stitchAlert as Alert } from '../components/StitchAlert';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getScreeningStatus, requestScreeningRole } from '@services/NativeBridge';
import { syncOnce } from '@services/SyncService';
import {
  getLastDeltaId,
  getBlockList,
  addToBlockList,
  removeFromBlockList,
  BlockListEntry,
  getBlockedPrefixes,
  addBlockedPrefix,
  removeBlockedPrefix,
  BlockedPrefixEntry,
  syncBlockListsWithCloud,
} from '@services/DatabaseService';
import { version as appVersion } from '../../package.json';
import { AuthAPI, BlockListAPI } from '@services/ApiService';
import { useAppStore } from '@store/useAppStore';
import { isValidPhoneNumber, normalizePhoneNumber } from '../utils/phoneUtils';
import { Badge, GoogleMultiColorIcon, StitchToggle, Symbol } from '../components/stitch';
import { a, c, fonts, t } from '../theme/stitch';

export default function SettingsScreen() {
  const {
    user,
    hasScreeningRole,
    setScreeningRole,
    login,
    register,
    logout,
    lastSyncAt,
    setSyncStatus,
  } = useAppStore();

  const [syncCursor, setSyncCursor] = useState(0);
  const [blockList, setBlockList] = useState<BlockListEntry[]>([]);
  const [newBlockNumber, setNewBlockNumber] = useState('');
  const [prefixList, setPrefixList] = useState<BlockedPrefixEntry[]>([]);
  const [newPrefix, setNewPrefix] = useState('');

  // Toggles
  const [silenceInternational, setSilenceInternational] = useState(true);
  const [autoDropScamRisk, setAutoDropScamRisk] = useState(true);

  // Auth modal
  const [isAuthModalVisible, setIsAuthModalVisible] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [cloudSyncing, setCloudSyncing] = useState(false);

  const loadInfo = useCallback(async () => {
    const [cursor, blocks, prefixes] = await Promise.all([
      getLastDeltaId(),
      getBlockList(),
      getBlockedPrefixes(),
    ]);
    setSyncCursor(cursor);
    setBlockList(blocks);
    setPrefixList(prefixes);
  }, []);

  useEffect(() => {
    loadInfo();
    getScreeningStatus().then(status => setScreeningRole(status === 'granted'));
  }, [loadInfo, setScreeningRole]);

  const handleAddBlock = async () => {
    const trimmed = newBlockNumber.trim();
    if (!trimmed) {
      Alert.alert('Error', 'Please enter a phone number to block');
      return;
    }
    if (!isValidPhoneNumber(trimmed)) {
      Alert.alert('Invalid Format', 'Enter a valid number e.g. 08162051907 or +2348162051907');
      return;
    }
    const normalized = normalizePhoneNumber(trimmed);
    await addToBlockList({ phone_number: normalized, label: 'Manual Quarantined' }, true);
    setNewBlockNumber('');
    await loadInfo();
    if (user) {
      BlockListAPI.addNumber(normalized, 'Manual Quarantined').catch(() => {});
    }
    Alert.alert('Quarantined', `Calls from ${normalized} will now be rejected automatically.`);
  };

  const handleUnblock = (phoneNumber: string) => {
    Alert.alert(
      'Unblock Number',
      `Allow incoming calls from ${phoneNumber} to ring again?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          style: 'destructive',
          onPress: async () => {
            await removeFromBlockList(phoneNumber);
            await loadInfo();
            if (user) {
              BlockListAPI.removeNumber(phoneNumber).catch(() => {});
            }
          },
        },
      ],
    );
  };

  const handleAddPrefix = async () => {
    const trimmed = newPrefix.trim().replace(/[\s\-().*#]/g, '');
    if (!trimmed) {
      Alert.alert('Error', 'Please enter a number prefix (e.g. 0201888 or 081)');
      return;
    }
    if (trimmed.length < 3) {
      Alert.alert('Invalid Prefix', 'Prefix must be at least 3 digits.');
      return;
    }
    await addBlockedPrefix({ prefix: trimmed, label: 'VoIP Range Filter' }, true);
    setNewPrefix('');
    await loadInfo();
    if (user) {
      BlockListAPI.addPrefix(trimmed, 'VoIP Range Filter').catch(() => {});
    }
    Alert.alert('Prefix Rule Added', `All calls starting with ${trimmed} will now be rejected automatically.`);
  };

  const handleRemovePrefix = (prefix: string) => {
    Alert.alert(
      'Remove Rule',
      `Delete prefix filter ${prefix}*?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await removeBlockedPrefix(prefix);
            await loadInfo();
            if (user) {
              BlockListAPI.removePrefix(prefix).catch(() => {});
            }
          },
        },
      ],
    );
  };

  const handleAuthSubmit = async () => {
    if (!authEmail.trim() || !authPassword.trim()) {
      Alert.alert('Missing Info', 'Please enter your email and password.');
      return;
    }
    setAuthSubmitting(true);
    try {
      if (authMode === 'login') {
        await login(authEmail.trim(), authPassword);
      } else {
        await register(authEmail.trim(), authPassword, authName.trim() || undefined);
      }
      await loadInfo();
      setIsAuthModalVisible(false);
      setAuthEmail('');
      setAuthPassword('');
      setAuthName('');
      Alert.alert('Shield Network Connected', 'Your personal blocklists and prefix rules are synced across devices.');
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Authentication failed.';
      Alert.alert('Sign In Failed', typeof msg === 'string' ? msg : 'Please check your credentials.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsAuthModalVisible(false);
    try {
      const resp = await AuthAPI.getGoogleAuthUrl();
      if (resp.data?.auth_url) {
        await Linking.openURL(resp.data.auth_url);
        return;
      }
      throw new Error('No auth URL returned');
    } catch {
      // Fallback
      Linking.openURL('http://localhost:8088/api/v1/auth/oauth/google').catch(() => {
        Alert.alert('Error', 'Could not open Google sign in URL.');
      });
    }
  };

  const handleCloudSync = async () => {
    setCloudSyncing(true);
    try {
      if (user) {
        const res = await syncBlockListsWithCloud();
        await loadInfo();
        Alert.alert('Cloud Synced ☁️', `Synced ${res.numbersCount} blocked numbers and ${res.prefixesCount} prefixes.`);
      } else {
        const r = await syncOnce();
        setSyncStatus({ lastSyncAt: new Date(), deltasCount: r.deltasApplied, syncing: false });
        await loadInfo();
        Alert.alert('Delta Synced', `Applied ${r.deltasApplied} global spam records.`);
      }
    } catch {
      Alert.alert('Sync Failed', 'Could not sync blocklists with cloud server.');
    } finally {
      setCloudSyncing(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Sign Out of Cloud Account?',
      'Signing out will pause encrypted cross-device rule syncing. Your existing local blocklists will remain active on this phone.',
      [
        { text: 'Keep Signed In', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await logout();
            await loadInfo();
          },
        },
      ],
      {
        icon: 'logout',
        variant: 'destructive',
        capsule: 'AES-256 Rules Preserved Locally',
        capsuleIcon: 'shield',
      },
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Permanently Delete Account?',
      'This will immediately and permanently erase your account, login credentials, and all synchronized cloud blocklists. Local filters on this device will not be deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: async () => {
            try {
              await AuthAPI.deleteAccount();
              await logout();
              await loadInfo();
              Alert.alert('Account Deleted', 'Your account and personal cloud data have been completely erased.');
            } catch (err: any) {
              const msg = err.response?.data?.detail || err.message || 'Failed to delete account.';
              Alert.alert('Error', typeof msg === 'string' ? msg : 'Failed to delete account.');
            }
          },
        },
      ],
      {
        icon: 'delete_forever',
        variant: 'destructive',
        capsule: 'Permanent Irreversible Deletion',
        capsuleIcon: 'warning',
      },
    );
  };

  const isProUser = Boolean(user?.is_pro);
  const subscriptionTierLabel = isProUser ? 'Shield Pro Active' : 'Shield Free';
  const tierPriorityLabel = isProUser ? 'Tier 1 Priority' : 'Standard Tier';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Top App Bar */}
      <View style={styles.topBar}>
        <View style={styles.inline}>
          <Symbol name="shield" size={24} color={c.primary} />
          <Text style={[t.headlineSm, { color: c.onSurface }]}>ShieldCall</Text>
        </View>
        <View style={[styles.inline, { gap: 12 }]}>
          <View
            style={[
              styles.proPill,
              !isProUser && {
                backgroundColor: a(c.outline, 0.1),
                borderColor: a(c.outline, 0.25),
              },
            ]}>
            <Text
              style={[
                t.labelBadge,
                { color: isProUser ? c.secondary : c.onSurfaceVariant, fontSize: 10 },
              ]}>
              v{appVersion} {isProUser ? 'PRO' : 'FREE'}
            </Text>
          </View>
          <TouchableOpacity
            accessibilityLabel="Sync status"
            style={{ padding: 4 }}
            onPress={handleCloudSync}
            disabled={cloudSyncing}>
            <Symbol name="sync" size={20} color={c.onSurfaceVariant} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Title Area */}
        <View style={styles.titleArea}>
          <View style={{ flex: 1 }}>
            <Text style={[t.headlineLg, { color: c.onSurface }]}>Shield Settings &amp; Rules</Text>
            <Text style={[t.bodySm, { color: c.onSurfaceVariant, marginTop: 2 }]}>
              Real-time telecommunications filter &amp; encrypted ruleset sync
            </Text>
          </View>
          <View style={styles.tuneBadge}>
            <Symbol name="tune" size={14} color={c.primary} />
          </View>
        </View>

        {/* Section 1: Cloud Account Card */}
        <View style={styles.card}>
          <View pointerEvents="none" style={styles.cloudGlow} />
          <View style={styles.cardHeaderStack}>
            <View style={styles.syncedChip}>
              <Text style={{ fontSize: 12 }}>☁️</Text>
              <Text style={[t.labelBadge, { color: c.secondary, fontFamily: fonts.mono700 }]}>
                {user ? 'Synced Across Devices' : 'Local Standalone Mode'}
              </Text>
            </View>
            <View style={styles.onlinePill}>
              <View style={styles.pulseDot} />
              <Text style={[t.labelCaption, { color: c.secondary, fontFamily: fonts.mono700, letterSpacing: 0.8 }]}>
                SHIELD NETWORK ONLINE
              </Text>
            </View>
          </View>

          {user ? (
            <View style={styles.userSectionStacked}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handleLogout}
                style={[styles.inline, { gap: 12, marginBottom: 16 }]}>
                <View style={styles.userIconWrap}>
                  <Symbol name="person" size={24} color={c.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[t.bodyLg, { color: c.onSurface, fontFamily: fonts.manrope600, fontSize: 16 }]} numberOfLines={1}>
                    {user.email}
                  </Text>
                  <View style={[styles.inline, { marginTop: 4, gap: 6 }]}>
                    <View
                      style={[
                        styles.proTag,
                        !isProUser && {
                          backgroundColor: a(c.outline, 0.08),
                          borderColor: a(c.outline, 0.25),
                        },
                      ]}>
                      <Text
                        style={[
                          t.labelBadge,
                          {
                            color: isProUser ? c.secondary : c.onSurfaceVariant,
                            fontSize: 10,
                            fontFamily: fonts.mono700,
                          },
                        ]}>
                        {subscriptionTierLabel}
                      </Text>
                    </View>
                    <Text style={[t.bodySm, { color: c.outline }]}>• {tierPriorityLabel}</Text>
                  </View>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.syncBtn}
                onPress={handleCloudSync}
                disabled={cloudSyncing}
                activeOpacity={0.85}>
                {cloudSyncing ? (
                  <ActivityIndicator size="small" color={c.onPrimaryFixed} />
                ) : (
                  <>
                    <Symbol name="sync" size={18} color={c.onPrimaryFixed} />
                    <Text style={[t.headlineSm, { fontSize: 14, color: c.onPrimaryFixed, fontFamily: fonts.grotesk600 }]}>
                      Sync Blocklists Now
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.guestSection}>
              <View style={[styles.inline, { gap: 12, marginBottom: 14 }]}>
                <View style={styles.userIconWrap}>
                  <Symbol name="cloud_done" size={24} color={c.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[t.bodyLg, { color: c.onSurface, fontFamily: fonts.manrope600 }]}>
                    Multi-Device Cloud Sync
                  </Text>
                  <Text style={[t.bodySm, { color: c.outline, marginTop: 2 }]}>
                    Link your account so blocked numbers follow you everywhere
                  </Text>
                </View>
              </View>

              <View style={{ gap: 8 }}>
                <TouchableOpacity
                  style={styles.syncBtn}
                  onPress={() => {
                    setAuthMode('login');
                    setIsAuthModalVisible(true);
                  }}>
                  <Text style={[t.headlineSm, { fontSize: 14, color: c.onPrimaryFixed, fontFamily: fonts.grotesk600 }]}>
                    Sign In / Create Account
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.googleBtn}
                  onPress={handleGoogleSignIn}>
                  <GoogleMultiColorIcon size={18} />
                  <Text style={[t.bodyMd, { color: c.onSurfaceVariant, fontFamily: fonts.manrope600 }]}>
                    Sign in with Google
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={styles.cardFooter}>
            <View style={[styles.inline, { gap: 6 }]}>
              <Symbol name="schedule" size={14} color={c.outline} />
              <Text style={[t.bodySm, { color: c.outline }]}>
                {lastSyncAt ? `Last synced ${lastSyncAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Last synced 4 mins ago'}
              </Text>
              <Text style={{ color: c.outlineVariant }}>•</Text>
              <Text style={[t.bodySm, { color: c.outline }]}>Hash:</Text>
              <Text style={[t.labelCode, { color: c.onSurface, fontFamily: fonts.mono700 }]}>8f9b..c2e1</Text>
            </View>

            <View style={[styles.inline, { gap: 8, marginTop: 4 }]}>
              <Text style={[t.labelCaption, { color: c.outline, letterSpacing: 0.8 }]}>ALT LINK:</Text>
              <TouchableOpacity onPress={handleGoogleSignIn} style={styles.altBadge}>
                <Text style={[t.labelBadge, { color: c.onSurfaceVariant, fontFamily: fonts.mono700 }]}>Google</Text>
              </TouchableOpacity>
              <View style={styles.altBadge}>
                <Text style={[t.labelBadge, { color: c.onSurfaceVariant, fontFamily: fonts.mono700 }]}>Apple ID</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Section 2: System Telecom Integration Card */}
        <View style={[styles.card, { gap: 16 }]}>
          <View style={styles.telecomHeaderRow}>
            <View style={styles.telecomHeaderLeft}>
              <View style={styles.telecomIconWrap}>
                <Symbol name="verified_user" size={18} color={c.secondary} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[t.headlineSm, { color: c.onSurface, fontSize: 16, lineHeight: 21 }]}>
                  System{'\n'}Telecom{'\n'}Integration
                </Text>
                <Text style={[t.bodySm, { color: c.onSurfaceVariant, marginTop: 4, fontSize: 11, lineHeight: 15 }]}>
                  Android Telecom Call{'\n'}Screening Role status
                </Text>
              </View>
            </View>

            <View style={styles.activePill}>
              <Symbol name="check_circle" size={13} color={hasScreeningRole ? c.secondary : c.error} />
              <Text style={[t.labelBadge, { color: hasScreeningRole ? c.secondary : c.error, fontFamily: fonts.mono700, fontSize: 10, lineHeight: 13 }]}>
                {hasScreeningRole ? 'ACTIVE (Default\nScreening App)' : 'INACTIVE'}
              </Text>
            </View>
          </View>

          {!hasScreeningRole && (
            <TouchableOpacity style={styles.grantBtn} onPress={requestScreeningRole}>
              <Text style={[t.bodySm, { color: c.primary, fontFamily: fonts.manrope600 }]}>
                Tap to grant Android Call Screening permission
              </Text>
            </TouchableOpacity>
          )}

          {/* Toggle 1 */}
          <View style={styles.toggleCell}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[t.bodyLg, { color: c.onSurface, fontFamily: fonts.manrope600 }]}>
                Silence Unknown International Callers
              </Text>
              <Text style={[t.bodySm, { color: c.outline, marginTop: 2 }]}>
                Mute ringers immediately if the caller's country code differs from local SIM.
              </Text>
            </View>
            <StitchToggle value={silenceInternational} onChange={setSilenceInternational} />
          </View>

          {/* Toggle 2 */}
          <View style={styles.toggleCell}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[t.bodyLg, { color: c.onSurface, fontFamily: fonts.manrope600 }]}>
                Auto-Drop 90%+ Scam Risk Calls
              </Text>
              <Text style={[t.bodySm, { color: c.outline, marginTop: 2 }]}>
                Disconnect robocallers before handset wake-up via ShieldCall AI heuristics.
              </Text>
            </View>
            <StitchToggle value={autoDropScamRisk} onChange={setAutoDropScamRisk} />
          </View>
        </View>

        {/* Section 3: Blocked Number Prefixes */}
        <View style={[styles.card, { gap: 16 }]}>
          <View style={{ gap: 6 }}>
            <View style={styles.prefixHeaderRow}>
              <View style={[styles.inline, { flex: 1, marginRight: 8 }]}>
                <Symbol name="dialpad" size={20} color={c.primary} />
                <Text style={[t.headlineSm, { color: c.onSurface, flex: 1, fontSize: 17 }]}>
                  Blocked Number Prefixes
                </Text>
              </View>
              <View style={styles.prefixRulesBadge}>
                <Text style={[t.labelBadge, { color: c.primary, fontSize: 10, lineHeight: 13, textAlign: 'center' }]}>
                  {prefixList.length} Active{'\n'}Rules
                </Text>
              </View>
            </View>
            <Text style={[t.bodySm, { color: c.onSurfaceVariant, lineHeight: 16 }]}>
              Instantly drop all calls starting with known spam robocall centers before they ring.
            </Text>
          </View>

          {/* Add Prefix Form */}
          <View style={styles.prefixAddForm}>
            <View style={styles.prefixInputWrap}>
              <Symbol name="dialpad" size={16} color={c.outline} />
              <TextInput
                style={[t.labelCode, styles.prefixInput]}
                placeholder="e.g. 0201888 or 081"
                placeholderTextColor={a(c.outline, 0.6)}
                value={newPrefix}
                onChangeText={setNewPrefix}
                keyboardType="phone-pad"
              />
            </View>
            <TouchableOpacity style={styles.prefixAddBtn} onPress={handleAddPrefix}>
              <Symbol name="add" size={16} color={c.onSurface} />
              <Text style={[t.bodyMd, { color: c.onSurface, fontFamily: fonts.manrope600, fontSize: 13 }]}>
                Add Rule
              </Text>
            </TouchableOpacity>
          </View>

          {/* List of rules */}
          <View style={{ gap: 10 }}>
            {prefixList.map(rule => (
              <View key={rule.prefix} style={styles.ruleCell}>
                <View style={[styles.inline, { gap: 12, flex: 1 }]}>
                  <View style={styles.ruleIconWrap}>
                    <Symbol name="block" size={16} color={c.error} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.inline}>
                      <Text style={[t.labelCode, { color: c.onSurface, fontFamily: fonts.mono700, fontSize: 14 }]}>
                        {rule.prefix.replace(/[\s\-().*#]/g, '')}*
                      </Text>
                      <View style={styles.ruleBadge}>
                        <Text style={[t.labelBadge, { color: c.error }]}>VoIP Range</Text>
                      </View>
                    </View>
                    <Text style={[t.bodySm, { color: c.onSurfaceVariant, marginTop: 2 }]}>
                      {rule.label || 'Automated VoIP / Telemarketing'}
                    </Text>
                    <View style={[styles.inline, { marginTop: 2, gap: 4 }]}>
                      <Symbol name="security" size={12} color={c.error} />
                      <Text style={[t.labelCaption, { color: c.outline }]}>Rejects all {rule.prefix.replace(/[\s\-().*#]/g, '')}xxxx calls</Text>
                    </View>
                  </View>
                </View>
                <TouchableOpacity
                  accessibilityLabel="Remove rule"
                  style={styles.deleteBtn}
                  onPress={() => handleRemovePrefix(rule.prefix)}>
                  <Symbol name="delete" size={18} color={c.outline} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>

        {/* Section 4: Personal Block List */}
        <View style={[styles.card, { gap: 16 }]}>
          <View style={styles.between}>
            <View style={{ flex: 1 }}>
              <Text style={[t.headlineSm, { color: c.onSurface }]}>
                Personal Block List ({blockList.length} numbers)
              </Text>
              <Text style={[t.bodySm, { color: c.onSurfaceVariant, marginTop: 2 }]}>
                Explicitly quarantined phone numbers and custom blacklist overrides
              </Text>
            </View>
          </View>

          {/* Search / Add form */}
          <View style={styles.searchBlockRow}>
            <Symbol name="person_search" size={18} color={c.outline} style={{ marginLeft: 12 }} />
            <TextInput
              style={[t.labelCode, styles.searchBlockInput]}
              placeholder="Search or enter +234..."
              placeholderTextColor={a(c.outline, 0.6)}
              value={newBlockNumber}
              onChangeText={setNewBlockNumber}
              keyboardType="phone-pad"
            />
            <TouchableOpacity style={styles.blockBtn} onPress={handleAddBlock}>
              <Text style={[t.labelBadge, { color: c.onSurface, fontSize: 12 }]}>+ Block</Text>
            </TouchableOpacity>
          </View>

          {/* List */}
          <View style={{ gap: 8 }}>
            {blockList.slice(0, 50).map(item => (
              <View key={item.phone_number} style={styles.blockCell}>
                <View style={[styles.inline, { gap: 12, flex: 1 }]}>
                  <View style={styles.blockAvatar}>
                    <Symbol name="phone_disabled" size={14} color={c.outline} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[t.labelCode, { color: c.onSurface, fontSize: 13, fontFamily: fonts.mono600 }]}>
                      {item.phone_number}
                    </Text>
                    <Text style={[t.labelCaption, { color: c.outline }]}>
                      {item.label ? `Flagged: ${item.label}` : 'Quarantined caller'}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={{ padding: 6 }}
                  onPress={() => handleUnblock(item.phone_number)}>
                  <Text style={[t.bodySm, { color: c.primary, textDecorationLine: 'underline' }]}>
                    Unblock
                  </Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>

        {/* Sign out & Delete Account buttons (if logged in) */}
        {user && (
          <View style={{ gap: 8, marginTop: 4 }}>
            <TouchableOpacity style={styles.signOutBtn} onPress={handleLogout}>
              <Text style={[t.bodyMd, { color: c.error, fontFamily: fonts.manrope600 }]}>
                Sign Out of Cloud Account
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.signOutBtn, { backgroundColor: 'transparent', borderColor: 'rgba(239, 68, 68, 0.2)' }]}
              onPress={handleDeleteAccount}>
              <Text style={[t.bodySm, { color: '#F87171', fontFamily: fonts.manrope600 }]}>
                Permanently Delete Account & Data
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Auth Modal */}
      <Modal
        visible={isAuthModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsAuthModalVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setIsAuthModalVisible(false)}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback>
              <View style={styles.modalPanel}>
                <View style={styles.modalHandle} />
                <Text style={[t.headlineSm, { color: c.onSurface, marginBottom: 4 }]}>
                  {authMode === 'login' ? 'Sign In to ShieldCall' : 'Create Account'}
                </Text>
                <Text style={[t.bodySm, { color: c.outline, marginBottom: 16 }]}>
                  Synchronize your personal blocklists and prefix rules across all devices.
                </Text>

                <View style={styles.authTabs}>
                  <TouchableOpacity
                    style={[styles.authTab, authMode === 'login' && styles.authTabActive]}
                    onPress={() => setAuthMode('login')}>
                    <Text style={[t.labelBadge, { color: authMode === 'login' ? c.onSurface : c.outline }]}>
                      Sign In
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.authTab, authMode === 'register' && styles.authTabActive]}
                    onPress={() => setAuthMode('register')}>
                    <Text style={[t.labelBadge, { color: authMode === 'register' ? c.onSurface : c.outline }]}>
                      Create Account
                    </Text>
                  </TouchableOpacity>
                </View>

                {authMode === 'register' && (
                  <TextInput
                    style={[t.bodyMd, styles.modalInput]}
                    placeholder="Full Name (optional)"
                    placeholderTextColor={c.outline}
                    value={authName}
                    onChangeText={setAuthName}
                  />
                )}
                <TextInput
                  style={[t.bodyMd, styles.modalInput]}
                  placeholder="Email Address"
                  placeholderTextColor={c.outline}
                  value={authEmail}
                  onChangeText={setAuthEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <TextInput
                  style={[t.bodyMd, styles.modalInput]}
                  placeholder="Password"
                  placeholderTextColor={c.outline}
                  value={authPassword}
                  onChangeText={setAuthPassword}
                  secureTextEntry
                />

                <TouchableOpacity
                  style={[styles.syncBtn, { marginTop: 8 }]}
                  onPress={handleAuthSubmit}
                  disabled={authSubmitting}>
                  {authSubmitting ? (
                    <ActivityIndicator size="small" color={c.onPrimaryFixed} />
                  ) : (
                    <Text style={[t.headlineSm, { fontSize: 14, color: c.onPrimaryFixed, fontFamily: fonts.grotesk600 }]}>
                      {authMode === 'login' ? 'Sign In' : 'Create Account'}
                    </Text>
                  )}
                </TouchableOpacity>

                <View style={styles.modalDivider}>
                  <View style={styles.dividerLine} />
                  <Text style={[t.labelBadge, { color: c.outline }]}>OR</Text>
                  <View style={styles.dividerLine} />
                </View>

                <TouchableOpacity style={styles.googleBtn} onPress={handleGoogleSignIn}>
                  <GoogleMultiColorIcon size={18} />
                  <Text style={[t.bodyMd, { color: c.onSurfaceVariant, fontFamily: fonts.manrope600 }]}>
                    Sign in with Google
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.modalCancel} onPress={() => setIsAuthModalVisible(false)}>
                  <Text style={[t.bodyMd, { color: c.outline, fontFamily: fonts.manrope600 }]}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
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
  proPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: a(c.secondary, 0.1),
    borderWidth: 1,
    borderColor: a(c.secondary, 0.3),
  },

  scroll: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32, gap: 20 },

  titleArea: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 },
  tuneBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: c.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: a(c.outlineVariant, 0.3),
    alignItems: 'center',
    justifyContent: 'center',
  },

  card: {
    borderRadius: 16,
    padding: 18,
    backgroundColor: a(c.surfaceContainerLow, 0.9),
    borderWidth: 1,
    borderColor: a(c.outlineVariant, 0.3),
    overflow: 'hidden',
  },
  cloudGlow: {
    position: 'absolute',
    top: -48,
    right: -48,
    width: 144,
    height: 144,
    borderRadius: 72,
    backgroundColor: a(c.primaryContainer, 0.12),
  },
  cardHeaderStack: {
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 16,
  },
  syncedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: a(c.secondary, 0.1),
    borderWidth: 1,
    borderColor: a(c.secondary, 0.3),
  },
  onlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: a(c.secondary, 0.08),
    borderWidth: 1,
    borderColor: a(c.secondary, 0.25),
  },
  pulseDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.secondary },

  userSectionStacked: {
    paddingBottom: 16,
  },
  guestSection: {
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: a(c.outlineVariant, 0.2),
  },
  userIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: c.surfaceContainer,
    borderWidth: 1,
    borderColor: a(c.outlineVariant, 0.4),
    alignItems: 'center',
    justifyContent: 'center',
  },
  proTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: c.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: a(c.outlineVariant, 0.4),
  },
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: c.primaryContainer,
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: c.surfaceContainer,
    borderWidth: 1,
    borderColor: a(c.outlineVariant, 0.3),
  },

  cardFooter: {
    paddingTop: 14,
    gap: 8,
  },
  altBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: c.surfaceContainer,
    borderWidth: 1,
    borderColor: a(c.outlineVariant, 0.3),
  },

  telecomHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  telecomHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  telecomIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: a(c.secondary, 0.1),
    borderWidth: 1,
    borderColor: a(c.secondary, 0.3),
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: a(c.secondary, 0.15),
    borderWidth: 1,
    borderColor: a(c.secondary, 0.4),
    flexShrink: 0,
    alignSelf: 'flex-start',
  },
  grantBtn: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: a(c.primaryContainer, 0.15),
    borderWidth: 1,
    borderColor: a(c.primary, 0.3),
    alignItems: 'center',
  },
  toggleCell: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 12,
    backgroundColor: a(c.surfaceContainer, 0.6),
    borderWidth: 1,
    borderColor: a(c.outlineVariant, 0.2),
  },

  prefixHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  prefixRulesBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: a(c.primary, 0.1),
    borderWidth: 1,
    borderColor: a(c.primary, 0.3),
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prefixAddForm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  prefixInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: c.surfaceContainer,
    borderWidth: 1,
    borderColor: a(c.outlineVariant, 0.4),
  },
  prefixInput: {
    flex: 1,
    color: c.onSurface,
    paddingVertical: 0,
    fontSize: 13,
  },
  prefixAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: c.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: a(c.outlineVariant, 0.4),
    flexShrink: 0,
  },

  ruleCell: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 12,
    backgroundColor: a(c.surfaceContainer, 0.6),
    borderWidth: 1,
    borderColor: a(c.outlineVariant, 0.2),
  },
  ruleIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: a(c.errorContainer, 0.3),
    borderWidth: 1,
    borderColor: a(c.error, 0.3),
    alignItems: 'center',
    justifyContent: 'center',
  },
  ruleBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: a(c.error, 0.1),
    borderWidth: 1,
    borderColor: a(c.error, 0.25),
  },
  deleteBtn: { padding: 8, borderRadius: 8 },

  searchBlockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderRadius: 12,
    backgroundColor: c.surfaceContainer,
    borderWidth: 1,
    borderColor: a(c.outlineVariant, 0.4),
  },
  searchBlockInput: { flex: 1, color: c.onSurface, paddingHorizontal: 10, paddingVertical: 0 },
  blockBtn: {
    marginRight: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: c.surfaceContainerHighest,
  },

  blockCell: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    backgroundColor: a(c.surfaceContainer, 0.4),
    borderWidth: 1,
    borderColor: a(c.outlineVariant, 0.2),
  },
  blockAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: c.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },

  signOutBtn: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: a(c.errorContainer, 0.2),
    borderWidth: 1,
    borderColor: a(c.error, 0.3),
    alignItems: 'center',
  },

  // Modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalPanel: {
    backgroundColor: a(c.surfaceContainerLow, 0.98),
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: a(c.outlineVariant, 0.4),
    padding: 22,
    paddingBottom: 32,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: c.outlineVariant,
    alignSelf: 'center',
    marginBottom: 16,
  },
  authTabs: {
    flexDirection: 'row',
    backgroundColor: c.surfaceContainerLowest,
    borderRadius: 10,
    padding: 4,
    marginBottom: 14,
  },
  authTab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  authTabActive: { backgroundColor: c.surfaceContainerHighest },
  modalInput: {
    height: 48,
    borderRadius: 10,
    backgroundColor: c.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: a(c.outlineVariant, 0.4),
    color: c.onSurface,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  modalDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 14,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: a(c.outlineVariant, 0.3) },
  modalCancel: { padding: 12, alignItems: 'center', marginTop: 6 },
});
