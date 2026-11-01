/**
 * All visual proportions and the color LCD palette live here so a Figma
 * hand-off only touches this file. Every value is a ratio of the available
 * phone width unless noted.
 */

export const layout = {
  /** Max screen width in points, so it does not overstretch on tablets. */
  screenMaxWidth: 320,
  /** Screen width as a ratio of the available phone width. */
  screenWidthRatio: 0.84,
  /** LCD aspect ratio (width / height). figPod screen is squarish, ~4:4.2. */
  screenAspect: 4 / 4.2,
  /** Max wheel diameter in points. */
  wheelMaxDiameter: 270,
  /** Wheel diameter as a ratio of the available phone width. */
  wheelDiameterRatio: 0.74,
  /** Center Select button diameter as a ratio of the wheel diameter. */
  wheelInnerRatio: 0.36,
  /** Gap between the screen bezel and the wheel. */
  screenWheelGap: 36,
} as const;

export const wheel = {
  /** Degrees of rotation per emitted step. */
  tickDeg: 15,
  /** Minimum px travel before a pan is recognized. */
  panMinDistance: 4,
  /** Maximum px travel for a tap to still count as a tap. */
  tapMaxDistance: 8,
} as const;

/**
 * Color LCD palettes. "color" is the figPod colour-LCD look: white screen,
 * black text, iPod Classic blue highlight. Kept as a palette map so a theme
 * swap needs no per-component changes.
 *
 * This is a structural type (not the literal type of the map) so `Screen` can
 * derive a palette by overriding `highlightBackground`/`progressFill` with the
 * active theme's accent color without losing assignability.
 */
export type LcdPalette = {
  background: string;
  border: string;
  text: string;
  textDim: string;
  highlightBackground: string;
  highlightText: string;
  scrollbarTrack: string;
  scrollbarThumb: string;
  titleBarBorder: string;
  progressTrack: string;
  progressFill: string;
};

export const lcdPalettes = {
  color: {
    background: '#FFFFFF',
    border: '#FFFFFF',
    text: '#111111',
    textDim: '#6B7280',
    highlightBackground: '#2B72E6',
    highlightText: '#FFFFFF',
    scrollbarTrack: '#E5E7EB',
    scrollbarThumb: '#8E95A2',
    titleBarBorder: '#D0D4DC',
    progressTrack: '#E0E2E8',
    progressFill: '#1E69DE',
  },
  /** Slightly warmer variant, kept for completeness. */
  graphite: {
    background: '#FFFFFF',
    border: '#FFFFFF',
    text: '#1A1A1A',
    textDim: '#6B7280',
    highlightBackground: '#1E69DE',
    highlightText: '#FFFFFF',
    scrollbarTrack: '#E5E7EB',
    scrollbarThumb: '#8E95A2',
    titleBarBorder: '#D0D4DC',
    progressTrack: '#E0E2E8',
    progressFill: '#1E69DE',
  },
} as const satisfies Record<string, LcdPalette>;

export type LcdPaletteName = keyof typeof lcdPalettes;

export const DEFAULT_LCD_PALETTE: LcdPaletteName = 'color';

// ---------------------------------------------------------------------------
// App theme model (Feature 3). A single AppThemeConfig drives the shell, the
// click wheel and the screen UI, and can be layered with per-field overrides
// so Settings can "tinker" without defining a whole palette.
// ---------------------------------------------------------------------------

export type AppThemeConfig = {
  id: string;
  label: string;
  /** Chassis finish: the phone viewport behind the screen and wheel. */
  shellColor: string;
  /** Click-wheel face color. */
  wheelColor: string;
  /** Wheel label/glyph ink. */
  wheelTextColor: string;
  /** Screen background gradient, [top, bottom]. Drives Now Playing. */
  screenBgGradient: readonly [string, string];
  /** Selection pill, progress fill and other highlights. */
  accentColor: string;
};

/** The subset of a theme the user can override (identity stays fixed). */
export type ThemeOverrides = Partial<
  Pick<
    AppThemeConfig,
    'shellColor' | 'wheelColor' | 'wheelTextColor' | 'screenBgGradient' | 'accentColor'
  >
>;

export const themePresets = {
  'classic-silver': {
    id: 'classic-silver',
    label: 'Classic Silver',
    shellColor: '#E8ECF2',
    wheelColor: '#FFFFFF',
    wheelTextColor: '#7A828E',
    screenBgGradient: ['#5A5652', '#383532'] as const,
    accentColor: '#2971E7',
  },
  'u2-black-red': {
    id: 'u2-black-red',
    label: 'U2 Black/Red',
    shellColor: '#141416',
    wheelColor: '#C8102E',
    wheelTextColor: '#FFFFFF',
    screenBgGradient: ['#1C1C1E', '#000000'] as const,
    accentColor: '#E0301E',
  },
  'space-gray': {
    id: 'space-gray',
    label: 'Space Gray',
    shellColor: '#4A4E54',
    wheelColor: '#3A3E44',
    wheelTextColor: '#C8CDD4',
    screenBgGradient: ['#3A3A3C', '#1C1C1E'] as const,
    accentColor: '#0A84FF',
  },
  'midnight-blue': {
    id: 'midnight-blue',
    label: 'Midnight Blue',
    shellColor: '#16233F',
    wheelColor: '#22355C',
    wheelTextColor: '#A9C1E8',
    screenBgGradient: ['#1B2440', '#0C1326'] as const,
    accentColor: '#4F93F7',
  },
} satisfies Record<string, AppThemeConfig>;

export type ThemeId = keyof typeof themePresets;

export const THEME_ORDER: ThemeId[] = [
  'classic-silver',
  'u2-black-red',
  'space-gray',
  'midnight-blue',
];

export const DEFAULT_THEME_ID: ThemeId = 'classic-silver';

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return value !== null && value !== undefined && value in themePresets;
}

/**
 * Resolves a preset id plus optional overrides into a concrete config. An
 * unknown id (stale persisted value) falls back to the default preset.
 */
export function resolveAppTheme(
  themeId: string | null | undefined,
  overrides?: ThemeOverrides | null,
): AppThemeConfig {
  const base = themePresets[isThemeId(themeId) ? themeId : DEFAULT_THEME_ID];
  return {
    id: base.id,
    label: overrides ? `${base.label} (custom)` : base.label,
    shellColor: overrides?.shellColor ?? base.shellColor,
    wheelColor: overrides?.wheelColor ?? base.wheelColor,
    wheelTextColor: overrides?.wheelTextColor ?? base.wheelTextColor,
    screenBgGradient: overrides?.screenBgGradient ?? base.screenBgGradient,
    accentColor: overrides?.accentColor ?? base.accentColor,
  };
}

/**
 * The resolved default preset. A module-level constant (not a call per render)
 * so it can be used as a stable component default without breaking memoization.
 */
export const DEFAULT_APP_THEME: AppThemeConfig = resolveAppTheme(DEFAULT_THEME_ID, null);

// --- theme fields + swatches (for Settings > Themes > Custom) ---------------

export type ThemeField =
  | 'shellColor'
  | 'wheelColor'
  | 'wheelTextColor'
  | 'screenBgGradient'
  | 'accentColor';

export const THEME_FIELDS: { key: ThemeField; label: string }[] = [
  { key: 'shellColor', label: 'Shell Color' },
  { key: 'wheelColor', label: 'Wheel Color' },
  { key: 'wheelTextColor', label: 'Wheel Text' },
  { key: 'screenBgGradient', label: 'Screen Background' },
  { key: 'accentColor', label: 'Accent Color' },
];

export type ColorSwatch = { label: string; value: string };

/** Shared color choices for the flat color fields. */
export const COLOR_SWATCHES: ColorSwatch[] = [
  { label: 'White', value: '#FFFFFF' },
  { label: 'Silver', value: '#E8ECF2' },
  { label: 'Graphite', value: '#4A4E54' },
  { label: 'Black', value: '#141416' },
  { label: 'Red', value: '#C8102E' },
  { label: 'Blue', value: '#2971E7' },
  { label: 'Sky', value: '#4F93F7' },
  { label: 'Green', value: '#2FA84F' },
];

export type GradientSwatch = { label: string; value: readonly [string, string] };

/** Named [top, bottom] gradients for the screen background field. */
export const GRADIENT_SWATCHES: GradientSwatch[] = [
  { label: 'Warm Matte', value: ['#5A5652', '#383532'] },
  { label: 'Charcoal', value: ['#3A3A3C', '#1C1C1E'] },
  { label: 'True Black', value: ['#1C1C1E', '#000000'] },
  { label: 'Midnight', value: ['#1B2440', '#0C1326'] },
  { label: 'Deep Blue', value: ['#22355C', '#101A30'] },
  { label: 'Crimson', value: ['#5A1A1A', '#260808'] },
];

// --- tiny pure color helpers -----------------------------------------------

function expandHex(hex: string): string {
  const h = hex.replace('#', '');
  return h.length === 3 ? `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}` : `#${h}`;
}

function channel(hex: string, i: number): number {
  return parseInt(expandHex(hex).slice(1 + i * 2, 3 + i * 2), 16);
}

/** Linear blend: t=0 -> a, t=1 -> b. Inputs are #rrggbb (or #rgb). */
export function mixHex(a: string, b: string, t: number): string {
  const k = Math.max(0, Math.min(1, t));
  const out = [0, 1, 2].map((i) => {
    const av = channel(a, i);
    const bv = channel(b, i);
    return Math.max(0, Math.min(255, Math.round(av + (bv - av) * k)))
      .toString(16)
      .padStart(2, '0');
  });
  return `#${out.join('')}`;
}

export function lightenHex(hex: string, t: number): string {
  return mixHex(hex, '#FFFFFF', t);
}

export function darkenHex(hex: string, t: number): string {
  return mixHex(hex, '#000000', t);
}

/**
 * Perceived brightness of a #rrggbb color, 0 (black) .. 1 (white).
 * Rec. 601 weights: good enough for picking readable ink and sheen strength.
 */
export function hexLuminance(hex: string): number {
  const r = channel(hex, 0) / 255;
  const g = channel(hex, 1) / 255;
  const b = channel(hex, 2) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** True when light ink is the readable choice on top of `hex`. */
export function isDarkHex(hex: string): boolean {
  return hexLuminance(hex) < 0.55;
}

export const colors = {
  /** The whole phone viewport acts as the iPod face. */
  pageBackground: '#E8ECF2',
  chassisBg: '#E8ECF2',
  /** Thick black bezel framing the LCD. */
  bezel: '#0A0A0C',
  bezelEdge: '#000000',
  /** Screen's light silver status header (non-nowplaying). */
  headerBg: '#EAECEF',
  headerBorder: '#D0D4DC',
  headerText: '#111111',
  /** Dark charcoal nowplaying header / metadata. */
  npHeader: '#2B2B2E',
  npHeaderText: '#FFFFFF',
  npMetaBg: '#232427',
  npTitleText: '#FFFFFF',
  npArtistText: '#D1D5DB',
  npIndexText: '#9CA3AF',
  /** Retro fallback cover gradient endpoints. */
  npFallbackFrom: '#6D5BD0',
  npFallbackTo: '#1F2937',
  npFallbackAccent: '#FFFFFF',
  /** Click wheel. */
  wheelFace: '#FFFFFF',
  wheelRing: '#FFFFFF',
  wheelRingEdge: '#D4D8E0',
  wheelCenter: '#ECEFF4',
  wheelCenterEdge: '#C5CBD6',
  wheelLabel: '#7A828E',
  // Flat aliases kept for the Phase 1 components; they mirror "color".
  lcdBackground: lcdPalettes.color.background,
  lcdBorder: lcdPalettes.color.border,
  lcdText: lcdPalettes.color.text,
  lcdTextDim: lcdPalettes.color.textDim,
  lcdHighlightBackground: lcdPalettes.color.highlightBackground,
  lcdHighlightText: lcdPalettes.color.highlightText,
  lcdScrollbarTrack: lcdPalettes.color.scrollbarTrack,
  lcdScrollbarThumb: lcdPalettes.color.scrollbarThumb,
  debugBackground: '#111111',
  debugText: '#7CFF9B',
} as const;

export const fonts = {
  lcd: undefined as string | undefined,
  lcdTitleSize: 13,
  lcdRowSize: 13,
  lcdSmallSize: 10,
  debugSize: 10,
} as const;

export const radii = {
  bezel: 16,
  screen: 10,
  wheel: 999,
} as const;

export const spacing = {
  bezelPadding: 6,
  lcdPaddingH: 6,
  lcdPaddingV: 4,
  lcdRowHeight: 32,
  titleBarHeight: 22,
  scrollbarWidth: 4,
  scrollbarInset: 2,
  /** Extra height for a row that carries a sub-label. */
  lcdRowWithSubHeight: 30,
  /** Height of the optional bottom status line. */
  statusLineHeight: 16,
} as const;

export const timing = {
  /** Debounce window for the debug overlay's angle readout. */
  debugFlushMs: 80,
  /** How long "Loading..." shows before the loader resolves into rows. */
  loaderMinVisibleMs: 120,
  /** Alphabet jump HUD stays up this long after the last accelerated step. */
  jumpHudMs: 600,
  /** Marquee pause before each scroll pass. */
  marqueePauseMs: 1200,
  /** Pixels per second for the marquee scroll. */
  marqueeSpeed: 26,
  /** Hold this long on Next/Prev before fast-forward/rewind starts. */
  seekHoldMs: 350,
  /** Repeat interval of the seek loop while the wheel button is held. */
  seekRepeatMs: 200,
  /** Milliseconds jumped per repeat during the first 2 s of a hold. */
  seekStepMs: 3000,
  /** Milliseconds jumped per repeat after the hold has lasted 2 s. */
  seekStepFastMs: 6000,
  /** Hold duration after which the seek step doubles. */
  seekAccelAfterMs: 2000,
} as const;

export type Theme = {
  layout: typeof layout;
  wheel: typeof wheel;
  colors: typeof colors;
  fonts: typeof fonts;
  radii: typeof radii;
  spacing: typeof spacing;
  timing: typeof timing;
};

export const theme: Theme = {
  layout,
  wheel,
  colors,
  fonts,
  radii,
  spacing,
  timing,
};
