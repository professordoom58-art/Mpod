/**
 * All visual proportions live here so a Figma hand-off only touches this file.
 * Every value is a ratio of the available body width unless noted.
 */

export const layout = {
  /** Body width : height. iPod classic is roughly 0.6. */
  bodyAspect: 0.6,
  /** Outer body horizontal padding, as a ratio of screen width. */
  bodyPaddingRatio: 0.06,
  /** Max body width in points, so it does not stretch on tablets. */
  bodyMaxWidth: 430,
  /** LCD width as a ratio of body inner width. */
  screenWidthRatio: 0.92,
  /** LCD aspect ratio (width / height). 4:3 landscape. */
  screenAspect: 4 / 3,
  /** Wheel diameter as a ratio of body inner width. */
  wheelDiameterRatio: 0.9,
  /** Wheel center button diameter as a ratio of wheel diameter. */
  wheelInnerRatio: 0.36,
  /** Gap between screen and wheel, as a ratio of body inner width. */
  screenWheelGapRatio: 0.06,
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
 * LCD palettes. "classic" is the grey-green iPod LCD; "light" is the neutral
 * option for daylight readability. Both are complete so a swap needs no
 * per-component changes.
 */
export const lcdPalettes = {
  classic: {
    background: '#C7D6C0',
    border: '#2E2E2E',
    text: '#1E241C',
    textDim: '#5A6656',
    highlightBackground: '#2C3A2A',
    highlightText: '#DCE8D4',
    scrollbarTrack: '#B3C4AC',
    scrollbarThumb: '#5A6656',
    titleBarBorder: '#8FA089',
    progressTrack: '#AEBFA7',
    progressFill: '#2C3A2A',
  },
  light: {
    background: '#E8E8E4',
    border: '#2E2E2E',
    text: '#1A1A1A',
    textDim: '#6B6B66',
    highlightBackground: '#2E2E2E',
    highlightText: '#F2F2EE',
    scrollbarTrack: '#CFCFC8',
    scrollbarThumb: '#6B6B66',
    titleBarBorder: '#B0B0A8',
    progressTrack: '#C8C8C0',
    progressFill: '#2E2E2E',
  },
} as const;

export type LcdPaletteName = keyof typeof lcdPalettes;
export type LcdPalette = (typeof lcdPalettes)[LcdPaletteName];

export const DEFAULT_LCD_PALETTE: LcdPaletteName = 'classic';

export const colors = {
  pageBackground: '#C9CDD2',
  body: '#F4F4F2',
  bodyEdge: '#D8D8D4',
  bodyShadow: '#000000',
  wheelFace: '#FFFFFF',
  wheelRing: '#E4E4E1',
  wheelRingEdge: '#CFCFCB',
  wheelCenter: '#F7F7F5',
  wheelCenterEdge: '#D2D2CE',
  wheelLabel: '#8A8A86',
  // Flat aliases kept for the Phase 1 components; they mirror "classic".
  lcdBackground: lcdPalettes.classic.background,
  lcdBorder: lcdPalettes.classic.border,
  lcdText: lcdPalettes.classic.text,
  lcdTextDim: lcdPalettes.classic.textDim,
  lcdHighlightBackground: lcdPalettes.classic.highlightBackground,
  lcdHighlightText: lcdPalettes.classic.highlightText,
  lcdScrollbarTrack: lcdPalettes.classic.scrollbarTrack,
  lcdScrollbarThumb: lcdPalettes.classic.scrollbarThumb,
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
  body: 18,
  screen: 3,
  wheel: 999,
} as const;

export const spacing = {
  lcdPaddingH: 6,
  lcdPaddingV: 4,
  lcdRowHeight: 20,
  titleBarHeight: 18,
  scrollbarWidth: 4,
  scrollbarInset: 2,
  /** Extra height for a row that carries a sub-label. */
  lcdRowWithSubHeight: 28,
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
