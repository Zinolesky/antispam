/**
 * Stitch "Obsidian Sentinel" design tokens — copied 1:1 from the exported
 * Tailwind config in design/stitch/stitch_shieldcall_spam_blocker/*.html.
 */
import { TextStyle } from 'react-native';

/** Exact Material 3 palette from the Stitch export. */
export const c = {
  surfaceContainerLowest: '#0d0d1a', // app canvas
  surfaceContainerLow: '#1a1a28', // cards
  surfaceContainer: '#1e1e2c',
  surfaceContainerHigh: '#292937',
  surfaceContainerHighest: '#343342',
  surfaceBright: '#383847',
  surface: '#12121f',

  onSurface: '#e3e0f4',
  onSurfaceVariant: '#c8c4d6',
  outline: '#928fa0',
  outlineVariant: '#474554',

  primary: '#c6c0ff',
  primaryContainer: '#8b80ff',
  onPrimaryFixed: '#150066',
  onPrimaryContainer: '#21008e',
  onPrimary: '#2700a1',
  inversePrimary: '#5748d0',
  primaryFixed: '#e4dfff',

  secondary: '#40e17e',
  secondaryContainer: '#00c263',

  tertiary: '#ffb95d',
  tertiaryContainer: '#c98100',
  onTertiary: '#462a00',

  error: '#ffb4ab',
  errorContainer: '#93000a',
  onError: '#690005',

  white: '#ffffff',
};

/** Tailwind-style alpha helper: a('#8b80ff', 0.2) -> rgba(...) */
export function a(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Bundled font files (android/app/src/main/assets/fonts). */
export const fonts = {
  grotesk600: 'SpaceGrotesk-SemiBold',
  grotesk700: 'SpaceGrotesk-Bold',
  manrope400: 'Manrope-Regular',
  manrope500: 'Manrope-Medium',
  manrope600: 'Manrope-SemiBold',
  manrope700: 'Manrope-Bold',
  mono500: 'JetBrainsMono-Medium',
  mono600: 'JetBrainsMono-SemiBold',
  mono700: 'JetBrainsMono-Bold',
};

/** Stitch typography scale (fontSize / lineHeight / letterSpacing in px). */
export const t: Record<string, TextStyle> = {
  headlineLg: { fontFamily: fonts.grotesk600, fontSize: 28, lineHeight: 36, letterSpacing: -0.56 },
  headlineMd: { fontFamily: fonts.grotesk700, fontSize: 22, lineHeight: 30, letterSpacing: -0.22 },
  headlineSm: { fontFamily: fonts.grotesk700, fontSize: 18, lineHeight: 24 },
  bodyLg: { fontFamily: fonts.manrope500, fontSize: 16, lineHeight: 24, letterSpacing: -0.16 },
  bodyMd: { fontFamily: fonts.manrope400, fontSize: 14, lineHeight: 20 },
  bodySm: { fontFamily: fonts.manrope400, fontSize: 12, lineHeight: 16, letterSpacing: 0.12 },
  labelCode: { fontFamily: fonts.mono500, fontSize: 13, lineHeight: 18, letterSpacing: 0.26 },
  labelBadge: { fontFamily: fonts.mono600, fontSize: 11, lineHeight: 14, letterSpacing: 0.66 },
  labelCaption: { fontFamily: fonts.manrope600, fontSize: 10, lineHeight: 12, letterSpacing: 0.4 },
};
