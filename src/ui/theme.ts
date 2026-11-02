/**
 * All visual proportions and the color LCD palette live here so a Figma
 * hand-off only touches this file. Every value is a ratio of the available
 * phone width unless noted.
 */

export const layout = {
  /**
   * Max BEZEL width in points, so it does not overstretch on tablets. The LCD
   * itself is this width minus the bezel border on both sides.
   */
  screenMaxWidth: 520,
  /**
   * Bezel width as a ratio of the available phone width. 0.93 leaves the
   * 12-14 pt chassis margin on each side that the reference design has.
   */
  screenWidthRatio: 0.93,
  /** LCD aspect ratio (width / height): a wide, squarish iPod pane. */
  screenAspect: 1.15,
  /** Max wheel diameter in points. */
  wheelMaxDiameter: 340,
  /** Wheel diameter as a ratio of the available phone width. */
  wheelDiameterRatio: 0.76,
  /** Center Select button diameter as a ratio of the wheel diameter. */
  wheelInnerRatio: 0.36,
  /**
   * Minimum gap between the screen bezel and the wheel. The chassis column uses
   * space-between, so any extra height becomes this gap. Kept as a floor for
   * the shrink-to-fit calculation.
   */
  screenWheelGap: 20,
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

/**
 * A vertical screen gradient: two stops minimum, optionally a middle stop for
 * the richer reference backdrop (top, middle, bottom).
 */
export type ScreenGradient =
  | readonly [string, string]
  | readonly [string, string, string];

export type AppThemeConfig = {
  id: string;
  label: string;
  /** Chassis finish: the phone viewport behind the screen and wheel. */
  shellColor: string;
  /**
   * Optional vertical [top, bottom] chassis gradient (the "metallic" finish).
   * When present the viewport is painted with it and `shellColor` stays the
   * flat fallback — it is still used for the status-bar ink decision, the
   * first paint and any surface that cannot take a gradient.
   */
  shellGradient?: readonly [string, string];
  /** Click-wheel face color. */
  wheelColor: string;
  /** Wheel label/glyph ink. */
  wheelTextColor: string;
  /**
   * Optional Select-button face color. When it differs from `wheelColor` the
   * center button is painted in this color while the ring stays `wheelColor`.
   */
  centerButtonBg?: string;
  /**
   * Screen background gradient. Drives Now Playing; two stops, or three when
   * the preset wants the reference's warm three-band vignette.
   */
  screenBgGradient: ScreenGradient;
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
    // Reference warm matte charcoal: three explicit stops so Now Playing's
    // default backdrop is the concept's vignette, not an interpolated ramp.
    screenBgGradient: ['#5C5855', '#464340', '#35322F'] as const,
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
  // --- "Nano" saturation set (Feature 3): anodized metallic shells with a
  // satin-white wheel. `shellColor` is the midpoint of `shellGradient` so the
  // safe-area bands and the first paint match the gradient's average tone.
  softBlue: {
    id: 'softBlue',
    label: 'Soft Blue',
    shellColor: '#7CA1C4',
    shellGradient: ['#96B9D6', '#5D81A5'] as const,
    wheelColor: '#F7F7F7',
    wheelTextColor: '#5D81A5',
    centerButtonBg: '#7CA1C4',
    screenBgGradient: ['#2E5276', '#101A30'] as const,
    accentColor: '#4A729A',
  },
  brightYellow: {
    id: 'brightYellow',
    label: 'Bright Yellow',
    shellColor: '#E5B81B',
    shellGradient: ['#FFD93A', '#C29505'] as const,
    wheelColor: '#F7F7F7',
    wheelTextColor: '#8C6700',
    centerButtonBg: '#E5B81B',
    screenBgGradient: ['#4A3A0E', '#1A1404'] as const,
    accentColor: '#C29505',
  },
  softPink: {
    id: 'softPink',
    label: 'Soft Pink',
    shellColor: '#D982A1',
    shellGradient: ['#F09CB5', '#B85C7C'] as const,
    wheelColor: '#F7F7F7',
    wheelTextColor: '#9C3D5F',
    centerButtonBg: '#D982A1',
    screenBgGradient: ['#5A2233', '#23101A'] as const,
    accentColor: '#B85C7C',
  },
  deepRed: {
    id: 'deepRed',
    label: 'Deep Red',
    shellColor: '#B71C1C',
    shellGradient: ['#D32F2F', '#7F0000'] as const,
    wheelColor: '#F7F7F7',
    wheelTextColor: '#8E1414',
    centerButtonBg: '#B71C1C',
    screenBgGradient: ['#5A1010', '#1A0505'] as const,
    accentColor: '#B71C1C',
  },
} satisfies Record<string, AppThemeConfig>;

export type ThemeId = keyof typeof themePresets;

/**
 * A chassis finish the user can pick in Settings > Themes. Alias of `ThemeId`
 * kept as its own name because the model started as "case colors" and callers
 * outside this file validate against a chassis list.
 */
export type ChassisColor = ThemeId;

/**
 * Display/swipe order of the Built-in Themes list. The four "Nano" presets are
 * appended after the classic set so existing muscle memory and the persisted
 * `ui.theme` ids keep working unchanged.
 */
export const THEME_ORDER: ThemeId[] = [
  'classic-silver',
  'u2-black-red',
  'space-gray',
  'midnight-blue',
  'softBlue',
  'brightYellow',
  'softPink',
  'deepRed',
];

export const DEFAULT_THEME_ID: ThemeId = 'classic-silver';

/** Selectable chassis finishes, in Settings > Themes display order. */
export const CHASSIS_COLOR_ORDER: ChassisColor[] = THEME_ORDER;

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return value !== null && value !== undefined && value in themePresets;
}

/** Type guard for a persistable chassis finish id (same set as `isThemeId`). */
export function isChassisColor(
  value: string | null | undefined,
): value is ChassisColor {
  return isThemeId(value);
}

/**
 * Resolves a preset id plus optional overrides into a concrete config. An
 * unknown id (stale persisted value) falls back to the default preset.
 */
export function resolveAppTheme(
  themeId: string | null | undefined,
  overrides?: ThemeOverrides | null,
): AppThemeConfig {
  // Annotated so the optional finish fields (`shellGradient`, `centerButtonBg`)
  // are visible even for presets whose literal object omits them entirely.
  const base: AppThemeConfig = themePresets[isThemeId(themeId) ? themeId : DEFAULT_THEME_ID];
  return {
    id: base.id,
    label: overrides ? `${base.label} (custom)` : base.label,
    shellColor: overrides?.shellColor ?? base.shellColor,
    // The two finish-only fields are not user-cyclable swatches, so they always
    // come straight from the preset (Custom Colors keeps the preset's sheen).
    shellGradient: base.shellGradient,
    wheelColor: overrides?.wheelColor ?? base.wheelColor,
    wheelTextColor: overrides?.wheelTextColor ?? base.wheelTextColor,
    centerButtonBg: base.centerButtonBg,
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
  // Added with the "Nano" set so Custom Colors can cycle back to these hues and
  // the Themes rows can name them instead of showing "Custom".
  { label: 'Soft Blue', value: '#7CA1C4' },
  { label: 'Ochre', value: '#8C6700' },
  { label: 'Gold', value: '#E5B81B' },
  { label: 'Rose', value: '#D982A1' },
  { label: 'Crimson', value: '#B71C1C' },
];

export type GradientSwatch = { label: string; value: ScreenGradient };

/** Named screen-background gradients (2 or 3 stops) for the field cycle. */
export const GRADIENT_SWATCHES: GradientSwatch[] = [
  { label: 'Warm Matte', value: ['#5C5855', '#464340', '#35322F'] },
  { label: 'Charcoal', value: ['#3A3A3C', '#1C1C1E'] },
  { label: 'True Black', value: ['#1C1C1E', '#000000'] },
  { label: 'Midnight', value: ['#1B2440', '#0C1326'] },
  { label: 'Deep Blue', value: ['#22355C', '#101A30'] },
  { label: 'Crimson', value: ['#5A1A1A', '#260808'] },
  // Weekend "Nano" screen gradients (cool/amber/rose/blood), matching the four
  // new chassis presets.
  { label: 'Sky Night', value: ['#2E5276', '#101A30'] },
  { label: 'Amber Night', value: ['#4A3A0E', '#1A1404'] },
  { label: 'Rose Night', value: ['#5A2233', '#23101A'] },
  { label: 'Blood Red', value: ['#5A1010', '#1A0505'] },
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
  /** Outer black screen bezel. */
  bezel: 24,
  /** Inner LCD viewport, inside the bezel. */
  screen: 16,
  wheel: 999,
} as const;

export const spacing = {
  /** Bezel border thickness around the LCD. */
  bezelPadding: 10,
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
