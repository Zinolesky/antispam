---
name: Obsidian Sentinel
colors:
  surface: '#12121f'
  surface-dim: '#12121f'
  surface-bright: '#383847'
  surface-container-lowest: '#0d0d1a'
  surface-container-low: '#1a1a28'
  surface-container: '#1e1e2c'
  surface-container-high: '#292937'
  surface-container-highest: '#343342'
  on-surface: '#e3e0f4'
  on-surface-variant: '#c8c4d6'
  inverse-surface: '#e3e0f4'
  inverse-on-surface: '#2f2f3d'
  outline: '#928fa0'
  outline-variant: '#474554'
  surface-tint: '#c6c0ff'
  primary: '#c6c0ff'
  on-primary: '#2700a1'
  primary-container: '#8b80ff'
  on-primary-container: '#21008e'
  inverse-primary: '#5748d0'
  secondary: '#40e17e'
  on-secondary: '#003919'
  secondary-container: '#00c263'
  on-secondary-container: '#004821'
  tertiary: '#ffb95d'
  on-tertiary: '#462a00'
  tertiary-container: '#c98100'
  on-tertiary-container: '#3d2400'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e4dfff'
  primary-fixed-dim: '#c6c0ff'
  on-primary-fixed: '#150066'
  on-primary-fixed-variant: '#3f2bb8'
  secondary-fixed: '#63ff97'
  secondary-fixed-dim: '#40e17e'
  on-secondary-fixed: '#00210c'
  on-secondary-fixed-variant: '#005226'
  tertiary-fixed: '#ffddb7'
  tertiary-fixed-dim: '#ffb95d'
  on-tertiary-fixed: '#2a1700'
  on-tertiary-fixed-variant: '#653e00'
  background: '#12121f'
  on-background: '#e3e0f4'
  surface-variant: '#343342'
typography:
  display:
    fontFamily: Space Grotesk
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.03em
  display-mobile:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 30px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Space Grotesk
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: 0em
  body-lg:
    fontFamily: Manrope
    fontSize: 16px
    fontWeight: '500'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-md:
    fontFamily: Manrope
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  body-sm:
    fontFamily: Manrope
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-code:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: 0.02em
  label-badge:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.06em
  label-caption:
    fontFamily: Manrope
    fontSize: 10px
    fontWeight: '600'
    lineHeight: 12px
    letterSpacing: 0.04em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-tablet: 1.5rem
  margin: 1rem
  margin-tablet: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system establishes an ultra-refined, cyber-fintech defense aesthetic engineered for AI-driven communications security. The interface projects quiet authority, predictive intelligence, and impregnable trust. Designed specifically for security-conscious professionals and high-exposure individuals, the experience transforms raw telemetry and telecom noise into calm, decisive threat mitigation.

The visual architecture balances deep-space dark mode with high-precision glassmorphism. Surfaces emulate layered obsidian panels infused with ambient electric indigo radiation. Fine tactile micro-borders, luminous indicators, and stateful glow fields convey real-time active defense without inducing alarm fatigue. Interactions feel weighted, instantaneous, and definitive.

## Colors

The palette leverages a calibrated dark-spectrum canvas where functional luminescence signals threat levels and system fidelity:

- **Canvas & Structural Layers**: `#0D0D1A` anchors the root canvas in a deep obsidian navy. Stacked card surfaces utilize `#131327`, bounded by a sharp `1px` structural boundary of `#1E1E3A`. Elevated overlay sheets and floating filters transition to `#1A1A36` with alpha-blended glass properties.
- **Brand Primary (`#7C6FF7`)**: Electric Indigo drives authoritative interaction targets, active radar pulses, intelligence highlights, and authenticated system status.
- **Threat Vector Logic**:
  - **Verified / Safe (`#2ED573`)**: Emerald Green indicates cryptographic trust, allowlisted callers, verified carriers, and active shields.
  - **Screening / Warning (`#FFA502`)**: Amber Orange highlights suspicious patterns, unfamiliar caller IDs, and live AI screening transcriptions.
  - **High Threat / Blocked (`#FF4757`)**: Crimson Coral commands immediate defensive actions: intercepted robocalls, fraud rings, and spoofed vectors.
- **Typography Continuum**: Primary text uses `#FFFFFF` for absolute legibility; secondary support copy employs `#8A8AAA` for low-strain context; muted indicators and disabled states resolve to `#4A4A6A`.

## Typography

Typography establishes an intentional cadence between futuristic telemetry and human readability:

- **Display & Headlines (Space Grotesk)**: Imparts a technical, structural edge to primary screening states, active shield meters, and high-level analytical dashboards. Letter-spacing remains compressed on larger sizes to maintain visual tension.
- **Body & Long-form Context (Manrope)**: Delivers geometric balance, generous counters, and high legibility across dark backgrounds for live call transcriptions, security audit trails, and user configuration.
- **Badges, Codes & Metadata (JetBrains Mono)**: Anchors cryptographic verification hashes, caller carrier metrics, micro-badges, and timestamp headers with precise tabular alignment.

## Layout & Spacing

The layout model enforces strict spatial consistency optimized for single-thumb mobile interaction while adapting seamlessly to tablets and foldable devices:

- **Grid Strategy**: Fluid 4-column structure for mobile devices (<600px), transitioning to an 8-column layout for tablets/foldables (600px–1024px).
- **Edge Containment**: Standard phone viewports retain a persistent `1rem` (16px) outer margin to maximize usable real estate while avoiding curved hardware corners. Tablet frames expand to `2rem` (32px) margins with a maximum centered container width of `720px` to maintain focused density.
- **Rhythm**: Component interiors prioritize strict vertical rhythm based on an 8pt baseline scale. Micro-elements like pills, badges, and inline status icons utilize `space-xs` (4px) and `space-sm` (8px). Structural separation between cards and modular dashboard elements leverages `space-md` (16px) and `space-lg` (24px).

## Elevation & Depth

Visual hierarchy operates on physical glass layering combined with directional back-lit glows rather than legacy drop shadows:

- **Level 0 (Base Canvas)**: Solid `#0D0D1A`. Deep, static, non-interactive foundation.
- **Level 1 (Card & Modular Tier)**: `#131327` paired with a sharp `1px` solid border (`#1E1E3A`). When elevated or interactive, layers incorporate subtle backdrop filtration (`backdrop-filter: blur(12px)`) with `rgba(19, 19, 39, 0.85)` background fills.
- **Level 2 (Active Floating Overlays & Modals)**: Translucent obsidian panels (`rgba(26, 26, 54, 0.90)`) with backdrop blur (`blur(24px)`), an inner border stroke of `rgba(124, 111, 247, 0.20)`, and an ambient dark halo (`0 12px 32px -4px rgba(0, 0, 0, 0.65)`).
- **Threat Luminescence**: High-threat cards emit a localized, low-intensity ambient glow using the vector's primary signature:
  - Allowed: `0 0 24px -6px rgba(46, 213, 115, 0.25)`
  - Screening: `0 0 24px -6px rgba(255, 165, 2, 0.25)`
  - Blocked: `0 0 24px -6px rgba(255, 71, 87, 0.30)`
  - Core Brand Pulse: `0 0 32px -8px rgba(124, 111, 247, 0.35)`

## Shapes

The geometric framework couples pronounced corner curvetures with razor-sharp boundary strokes:

- Standard cards, interactive list cells, and screening status trays utilize `rounded-xl` (`1.5rem` / 24px), matching native hardware form factors and iOS/Android home indicators.
- Action sheets, interactive drawers, and system alerts scale to `rounded-2xl` (`2rem` / 32px) on top edges.
- Action buttons, interactive text fields, and segmented selectors adopt continuous `rounded-lg` (`1rem` / 16px) styling.
- Telemetry badges, carrier tags, and micro-toggles utilize a full pill radius (`9999px`) to maintain contrast against structural panel corners.

## Components

### Buttons & Interactive Controls
- **Primary Defensive Action**: Solid Electric Indigo (`#7C6FF7`) fill, white bold typography, rounded-lg (`1rem`), with an inner top highlight of `inset 0 1px 0 rgba(255, 255, 255, 0.25)`. Includes an active state press transition (`transform: scale(0.98)`).
- **Destructive / Block Action**: Crimson Coral (`#FF4757`) fill with matching halo, utilized strictly for terminating active threats.
- **Secondary Ghost**: `#131327` background, `1px` border of `#1E1E3A`, `#FFFFFF` text. On hover or press, the border illuminates to `#7C6FF7`.

### Micro-Badges & Status Tags
- Monospaced typography (`JetBrains Mono`, `11px`, uppercase, tracking +0.06em).
- Pill geometry with a `1px` perimeter border. Background fill is set to a 10% opacity tint of the respective vector color, while text and border utilize the 100% solid value (e.g., Blocked badge: `background: rgba(255, 71, 87, 0.10)`, `border: 1px solid #FF4757`, `color: #FF4757`).

### Cards & Telemetry Containers
- Built on `rounded-2xl` (`1.5rem`) outer curves.
- Background: `#131327` with a continuous `1px solid #1E1E3A` boundary.
- Internal padding calibrated strictly to `space-md` (`1rem`) on compact feeds and `space-lg` (`1.5rem`) on detail dashboards.

### Call Screening Feed Lists
- Edge-to-edge modular cells with a `space-sm` (`8px`) vertical inter-card gap.
- Leading avatar displays carrier security status: circular node with vector-tinted micro-icon.
- Center metadata groups caller ID (`Space Grotesk`, semi-bold) over real-time threat categorization (`Manrope`, regular, `#8A8AAA`).
- Trailing boundary contains JetBrains Mono timestamp and threat score micro-gauge.

### Real-Time AI Live Transcription Box
- Integrated glass container (`rgba(13, 13, 26, 0.65)`) framed by a subtle, pulsing indigo micro-border.
- Body font (`Manrope`, `14px`, `#FFFFFF`) with dynamic typing caret animated via `#7C6FF7`.

### Input Fields & Search Bars
- Background `#0D0D1A`, enclosed in `1px solid #1E1E3A`.
- Height pinned to 52px for mobile hit-target standards.
- Focus state triggers an immediate border transition to `#7C6FF7` alongside a subtle glow (`0 0 12px rgba(124, 111, 247, 0.25)`). Text color is `#FFFFFF` with placeholder copy fixed at `#4A4A6A`.

### Toggle Switches & Selection Controls
- Base track: `#1E1E3A`, transitioning to `#7C6FF7` when active.
- Switch thumb: Crisp `#FFFFFF` circle elevated with a micro-drop shadow. Checkboxes feature sharp rounded squares (`rounded: 6px`) with emerald green verification checks upon selection.