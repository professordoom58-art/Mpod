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
 */
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
} as const;

export type LcdPaletteName = keyof typeof lcdPalettes;
export type LcdPalette = (typeof lcdPalettes)[LcdPaletteName];

export const DEFAULT_LCD_PALETTE: LcdPaletteName = 'color';

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
