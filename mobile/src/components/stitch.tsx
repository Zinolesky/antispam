/**
 * Shared Stitch UI primitives: Material Symbols icon, badges, toggle,
 * and the call action bottom sheet used by the Shield and Logs screens.
 */
import React from 'react';
import {
  Image,
  Modal,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  ViewStyle,
} from 'react-native';
import { createIconSet } from 'react-native-vector-icons';
import glyphMap from '../theme/materialSymbols.json';
import { a, c, t } from '../theme/stitch';

const glyphs = glyphMap as Record<string, number>;
const OutlinedSet = createIconSet(glyphs, 'MaterialSymbolsOutlined', 'MaterialSymbolsOutlined.ttf');
const FilledSet = createIconSet(glyphs, 'MaterialSymbolsOutlinedFilled', 'MaterialSymbolsOutlinedFilled.ttf');

interface SymbolProps {
  /** Material Symbols name exactly as used in Stitch, e.g. "verified_user". */
  name: string;
  size?: number;
  color?: string;
  /** Equivalent of font-variation-settings: 'FILL' 1 */
  filled?: boolean;
  style?: StyleProp<TextStyle>;
}

export function Symbol({ name, size = 24, color = c.onSurface, filled, style }: SymbolProps) {
  const Set = filled ? FilledSet : OutlinedSet;
  return <Set name={name} size={size} color={color} style={style} />;
}

/** Pill micro-badge: 10% tint fill, 1px solid border, mono uppercase label. */
export function Badge({
  label,
  color,
  fillAlpha = 0.1,
  border = true,
  dot,
  icon,
  style,
  textStyle,
  rounded = 999,
}: {
  label: string;
  color: string;
  fillAlpha?: number;
  border?: boolean;
  dot?: boolean;
  icon?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  rounded?: number;
}) {
  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: a(color, fillAlpha),
          borderColor: border ? color : 'transparent',
          borderRadius: rounded,
        },
        style,
      ]}>
      {dot && <View style={[styles.dot, { backgroundColor: color }]} />}
      {icon && <Symbol name={icon} size={12} color={color} filled />}
      <Text style={[t.labelBadge, { color }, textStyle]}>{label}</Text>
    </View>
  );
}

/** Tailwind peer toggle from Stitch: 44x24 track, 20px white thumb. */
export function StitchToggle({
  value,
  onChange,
  activeColor = c.primaryContainer,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  activeColor?: string;
}) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      hitSlop={8}
      style={[styles.track, { backgroundColor: value ? activeColor : c.surfaceContainerHighest }]}>
      <View style={[styles.thumb, { transform: [{ translateX: value ? 20 : 0 }] }]} />
    </Pressable>
  );
}

/** Icon inside a rounded tinted square/circle (avatar nodes in feeds). */
export function IconNode({
  icon,
  color,
  size = 40,
  radius = 12,
  iconSize = 20,
  filled,
  fillAlpha = 0.1,
  borderAlpha = 0.4,
  background,
}: {
  icon: string;
  color: string;
  size?: number;
  radius?: number;
  iconSize?: number;
  filled?: boolean;
  fillAlpha?: number;
  borderAlpha?: number;
  background?: string;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: background ?? a(color, fillAlpha),
        borderWidth: borderAlpha > 0 ? 1 : 0,
        borderColor: a(color, borderAlpha),
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Symbol name={icon} size={iconSize} color={color} filled={filled} />
    </View>
  );
}

const googleLogoAsset = require('../assets/google.png');

/** Official Google multi-color "G" icon. */
export function GoogleMultiColorIcon({ size = 20 }: { size?: number }) {
  return (
    <Image
      source={googleLogoAsset}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}

/** Stitch "Interactive Call Action Bottom Sheet". */
export function CallActionSheet({
  visible,
  phone,
  meta,
  threat,
  onClose,
  onBlock,
  onReport,
  onWhitelist,
}: {
  visible: boolean;
  phone: string;
  meta: string;
  threat: boolean;
  onClose: () => void;
  onBlock: () => void;
  onReport: () => void;
  onWhitelist: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.sheetBackdrop}>
          <TouchableWithoutFeedback>
            <View style={styles.sheetPanel}>
              <View style={styles.sheetHandle} />
              <View style={styles.sheetHeader}>
                <View style={{ flex: 1 }}>
                  <View style={styles.row}>
                    <Text style={[t.headlineSm, { color: c.onSurface }]}>{phone}</Text>
                    <View
                      style={[
                        styles.sheetDot,
                        { backgroundColor: threat ? c.error : c.secondary },
                      ]}
                    />
                  </View>
                  <Text
                    style={[
                      t.bodySm,
                      { color: threat ? c.error : c.outline, marginTop: 2, fontFamily: 'Manrope-Medium' },
                    ]}>
                    {meta}
                  </Text>
                </View>
                <TouchableOpacity style={styles.sheetClose} onPress={onClose}>
                  <Symbol name="close" size={18} color={c.outline} />
                </TouchableOpacity>
              </View>

              <View style={{ gap: 10, paddingTop: 4 }}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[styles.sheetBtn, styles.sheetBtnBlock]}
                  onPress={onBlock}>
                  <View style={styles.row}>
                    <Symbol name="block" size={20} color={c.onError} />
                    <Text style={[styles.sheetBtnText, { color: c.onError }]}>
                      Block &amp; Blacklist Number
                    </Text>
                  </View>
                  <Symbol name="chevron_right" size={18} color={c.onError} />
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[styles.sheetBtn, styles.sheetBtnReport]}
                  onPress={onReport}>
                  <View style={styles.row}>
                    <Symbol name="flag" size={20} color={c.onTertiary} />
                    <Text style={[styles.sheetBtnText, { color: c.onTertiary }]}>
                      Report as Spam to Community
                    </Text>
                  </View>
                  <Symbol name="chevron_right" size={18} color={c.onTertiary} />
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[styles.sheetBtn, styles.sheetBtnSafe]}
                  onPress={onWhitelist}>
                  <View style={styles.row}>
                    <Symbol name="verified" size={20} color={c.secondary} filled />
                    <Text style={[styles.sheetBtnText, { color: c.secondary }]}>
                      White-list / Mark Safe
                    </Text>
                  </View>
                  <Symbol name="chevron_right" size={18} color={c.secondary} />
                </TouchableOpacity>

                <TouchableOpacity style={styles.sheetDismiss} onPress={onClose}>
                  <Text style={[t.bodyMd, { color: c.outline, fontFamily: 'Manrope-SemiBold' }]}>
                    Dismiss
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  track: { width: 44, height: 24, borderRadius: 12, padding: 2, justifyContent: 'center' },
  thumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: c.white,
    elevation: 2,
  },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheetPanel: {
    backgroundColor: a(c.surfaceContainerLow, 0.97),
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: a(c.outlineVariant, 0.4),
    padding: 20,
    paddingBottom: 28,
    gap: 16,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: c.outlineVariant,
    alignSelf: 'center',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: a(c.outlineVariant, 0.3),
    paddingBottom: 12,
  },
  sheetDot: { width: 8, height: 8, borderRadius: 4 },
  sheetClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: c.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
  },
  sheetBtnBlock: { backgroundColor: c.error, elevation: 6, shadowColor: '#ff4757' },
  sheetBtnReport: {
    backgroundColor: c.tertiaryContainer,
    borderWidth: 1,
    borderColor: a(c.tertiary, 0.4),
  },
  sheetBtnSafe: {
    backgroundColor: c.surfaceContainer,
    borderWidth: 1,
    borderColor: a(c.secondary, 0.4),
  },
  sheetBtnText: { fontFamily: 'SpaceGrotesk-SemiBold', fontSize: 16, lineHeight: 24 },
  sheetDismiss: { paddingVertical: 10, alignItems: 'center' },
});
