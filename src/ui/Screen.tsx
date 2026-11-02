/**
 * The LCD frame: a brushed-metal title bar (play indicator, centered title,
 * segmented battery) and a body area that renders the current frame.
 *
 * PERFORMANCE CONTRACT:
 *   - every hook is called unconditionally at the top of the component;
 *   - `MenuList` is never instantiated for the now-playing frame, so the list
 *     tree is not built and thrown away on every track change;
 *   - the `playing` subscription lives inside <ScreenHeader />, so a play/pause
 *     change re-renders the header only, never the list.
 *
 * All depth is drawn with react-native-svg gradients. No Platform branching.
 */

import { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, {
  Defs,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';

import {
  selectTopAlbumOverlay,
  selectTopItems,
  selectTopKind,
  selectTopLoading,
  selectTopSelectedIndex,
  selectTopStatus,
  selectTopTitle,
  selectTopWindowStart,
  useMenuStore,
} from '../nav/menuStack';
import type { NowPlayingLayout } from '../library/settings';
import { usePlayerStore } from '../player/store';
import { CoverFlow } from './CoverFlow';
import { MenuList } from './MenuList';
import { NowPlaying } from './NowPlaying';
import { ProgressView } from './ProgressView';
import {
  fonts,
  lcdPalettes,
  spacing,
  DEFAULT_APP_THEME,
  type AppThemeConfig,
  type LcdPalette,
} from './theme';
import { visibleRowCount } from './windowing';

type Props = {
  width: number;
  height: number;
  paletteName?: keyof typeof lcdPalettes;
  /**
   * Active app theme. The accent color overrides the LCD highlight/progress
   * colors and the screen background gradient drives the Now Playing screen.
   */
  appTheme?: AppThemeConfig;
  /** Diagonal LCD glass sheen (Settings > Glass Reflection). */
  glassReflection?: boolean;
  /** Which Now Playing design to render (Settings > Now Playing Style). */
  nowPlayingLayout?: NowPlayingLayout;
};

/** Brushed-metal header gradient and its hairline bottom edge. */
const HEADER_FROM = '#F0F2F5';
const HEADER_TO = '#D4D8E0';
const HEADER_BORDER = '#A2A8B4';
const HEADER_TEXT = '#2A2F38';

/** Segmented battery: green gradient body, dark outline. */
const BATTERY_FROM = '#3CD659';
const BATTERY_TO = '#24A83E';
const BATTERY_EDGE = '#3F4A3F';

/** Cover Flow reference: glossy blue transport triangle + smooth green cell. */
const CF_PLAY_FROM = '#3898FF';
const CF_PLAY_TO = '#0055CC';
const CF_PLAY_EDGE = '#003380';
const CF_BATTERY_FROM = '#9BE858';
const CF_BATTERY_TO = '#3BA818';

/**
 * Inner LCD corner radius. Deliberately smaller than the black bezel's radius
 * (radii.bezel) so the pane reads as inset; explicit per-corner values keep
 * Android from squaring the header gradient off inside the curve.
 */
const LCD_RADIUS = 16;

/** Glyph ink for the play/pause indicator. */
const GLYPH_DARK = '#3A4048';
const GLYPH_LIGHT = '#FFFFFF';

/**
 * Glossy play/pause glyph. A gradient fill plus a 1px light top edge reads as
 * a raised plastic button rather than a flat icon.
 */
function PlayPauseGlyph({ playing }: { playing: boolean }) {
  const w = 9;
  const h = 10;
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <Defs>
        <LinearGradient id="glyphFill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={GLYPH_DARK} />
          <Stop offset="1" stopColor="#12161C" />
        </LinearGradient>
      </Defs>
      {playing ? (
        <>
          <Rect x={0.5} y={0.5} width={2.6} height={9} rx={0.8} fill="url(#glyphFill)" />
          <Rect x={5.4} y={0.5} width={2.6} height={9} rx={0.8} fill="url(#glyphFill)" />
          <Rect x={0.5} y={0.5} width={2.6} height={1} rx={0.5} fill={GLYPH_LIGHT} opacity={0.55} />
          <Rect x={5.4} y={0.5} width={2.6} height={1} rx={0.5} fill={GLYPH_LIGHT} opacity={0.55} />
        </>
      ) : (
        <>
          <Path d="M1 0.6 L8.4 5 L1 9.4 Z" fill="url(#glyphFill)" />
          <Path d="M1 0.6 L8.4 5 L1 3.2 Z" fill={GLYPH_LIGHT} opacity={0.35} />
        </>
      )}
    </Svg>
  );
}

/**
 * Cover Flow reference transport: the classic glossy blue play triangle. A
 * vertical blue gradient, a dark edge and a light top wedge sell the enamel.
 */
function GlossyPlayGlyph() {
  const w = 10;
  const h = 11;
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <Defs>
        <LinearGradient id="cfPlayFill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={CF_PLAY_FROM} />
          <Stop offset="1" stopColor={CF_PLAY_TO} />
        </LinearGradient>
      </Defs>
      <Path
        d="M1.4 0.9 L9.2 5.5 L1.4 10.1 Z"
        fill="url(#cfPlayFill)"
        stroke={CF_PLAY_EDGE}
        strokeWidth={1}
        strokeLinejoin="round"
      />
      {/* Enamel highlight over the upper half of the triangle. */}
      <Path d="M2.1 1.6 L7.4 4.9 L2.1 4.9 Z" fill="#FFFFFF" opacity={0.42} />
    </Svg>
  );
}

/**
 * Cover Flow reference battery: one smooth green gradient cell (no segments),
 * dark outline and terminal nub — the glossy gauge from the reference image.
 */
function GlossyBattery({ level = 0.8 }: { level?: number }) {
  const bodyW = 18;
  const bodyH = 9;
  const inset = 1.6;
  const fill = Math.min(1, Math.max(0, level));

  return (
    <Svg width={bodyW + 3} height={bodyH} viewBox={`0 0 ${bodyW + 3} ${bodyH}`}>
      <Defs>
        <LinearGradient id="cfBatteryFill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={CF_BATTERY_FROM} />
          <Stop offset="1" stopColor={CF_BATTERY_TO} />
        </LinearGradient>
      </Defs>
      <Rect
        x={0.5}
        y={0.5}
        width={bodyW - 1}
        height={bodyH - 1}
        rx={2}
        stroke={BATTERY_EDGE}
        strokeWidth={1}
        fill="none"
      />
      <Rect x={bodyW} y={bodyH / 2 - 2} width={2} height={4} rx={0.8} fill={BATTERY_EDGE} />
      <Rect
        x={inset}
        y={inset}
        width={Math.max(0, (bodyW - inset * 2) * fill)}
        height={bodyH - inset * 2}
        rx={0.8}
        fill="url(#cfBatteryFill)"
      />
      {/* 1px specular line inside the top of the cell. */}
      <Rect
        x={inset}
        y={inset}
        width={Math.max(0, (bodyW - inset * 2) * fill)}
        height={1}
        rx={0.5}
        fill="#FFFFFF"
        opacity={0.45}
      />
    </Svg>
  );
}

/**
 * 3D segmented battery. Four cells fill progressively; the whole body carries
 * a vertical green gradient and a 1px outline so it reads as a physical gauge.
 */
function BatteryIcon({ level }: { level: number }) {
  const bodyW = 18;
  const bodyH = 9;
  const cells = 4;
  const gap = 1;
  const inset = 1.5;
  const cellW = (bodyW - inset * 2 - gap * (cells - 1)) / cells;
  const filled = Math.round(Math.min(1, Math.max(0, level)) * cells);

  return (
    <Svg width={bodyW + 3} height={bodyH} viewBox={`0 0 ${bodyW + 3} ${bodyH}`}>
      <Defs>
        <LinearGradient id="batteryFill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={BATTERY_FROM} />
          <Stop offset="1" stopColor={BATTERY_TO} />
        </LinearGradient>
      </Defs>

      {/* Shell */}
      <Rect
        x={0.5}
        y={0.5}
        width={bodyW - 1}
        height={bodyH - 1}
        rx={2}
        stroke={BATTERY_EDGE}
        strokeWidth={1}
        fill="none"
      />
      {/* Terminal nub */}
      <Rect x={bodyW} y={bodyH / 2 - 2} width={2} height={4} rx={0.8} fill={BATTERY_EDGE} />

      {/* Cells */}
      {Array.from({ length: cells }).map((_, i) => {
        const x = inset + i * (cellW + gap);
        const on = i < filled;
        return (
          <Rect
            key={i}
            x={x}
            y={inset}
            width={cellW}
            height={bodyH - inset * 2}
            rx={0.6}
            fill={on ? 'url(#batteryFill)' : '#C9CDD4'}
          />
        );
      })}
    </Svg>
  );
}

/**
 * Diagonal LCD glass reflection: a translucent white band from the top-right
 * corner down to the bottom-left, covering the upper-left half of the pane.
 * Purely decorative — it never intercepts a touch.
 */
function GlassSheen({ width, height }: { width: number; height: number }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="glassSheen" x1="1" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.07} />
            <Stop offset="0.55" stopColor="#FFFFFF" stopOpacity={0.03} />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Path d={`M0 0 H${width} L0 ${height} Z`} fill="url(#glassSheen)" />
      </Svg>
    </View>
  );
}

/**
 * The brushed-metal title bar. Subscribes to `playing` itself so the play
 * indicator can change without re-rendering the list below it.
 */
function ScreenHeader({
  title,
  width,
  variant = 'plain',
}: {
  title: string;
  width: number;
  /** Cover Flow puts the bold title on the left and the transport + battery right. */
  variant?: 'plain' | 'coverflow';
}) {
  const playing = usePlayerStore((s) => s.playing);
  const h = spacing.titleBarHeight;
  const coverFlow = variant === 'coverflow';
  // Match the LCD's own radius. Applied to the header container AND painted
  // into the SVG (rounded-top path) so Android cannot render square corners
  // over the black bezel even when the SVG is its own native view.
  const topRadius = LCD_RADIUS;

  return (
    <View
      style={[
        styles.titleBar,
        {
          height: h,
          borderTopLeftRadius: topRadius,
          borderTopRightRadius: topRadius,
        },
      ]}
    >
      {/*
        Metallic gradient + hairline bottom edge, drawn behind the content.
        Drawn in pixel units (no viewBox) so the 1px border is exactly 1 point
        instead of being scaled by a normalized coordinate space.
      */}
      <Svg style={[StyleSheet.absoluteFill, styles.headerSvg]} width={width} height={h}>
        <Defs>
          <LinearGradient id="headerMetal" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={HEADER_FROM} />
            <Stop offset="1" stopColor={HEADER_TO} />
          </LinearGradient>
        </Defs>
        {/* Rounded-top gradient: the corner radius is part of the geometry,
            not just a parent clip, so the header can never paint a square
            corner into the bezel on a platform that ignores overflow. */}
        <Path
          d={`M0 ${topRadius} Q0 0 ${topRadius} 0 H${width - topRadius} Q${width} 0 ${width} ${topRadius} V${h} H0 Z`}
          fill="url(#headerMetal)"
        />
        {/* 1px bottom border. */}
        <Rect x={0} y={h - 1} width={width} height={1} fill={HEADER_BORDER} />
      </Svg>

      {coverFlow ? (
        <>
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={[styles.titleText, styles.titleTextLeft]}
          >
            {title}
          </Text>

          <View style={styles.coverFlowRight}>
            {playing ? (
              <View style={styles.headerPlay}>
                <GlossyPlayGlyph />
              </View>
            ) : null}
            <GlossyBattery level={0.8} />
          </View>
        </>
      ) : (
        <>
          <View style={styles.titleLeft}>{playing ? <PlayPauseGlyph playing /> : null}</View>

          <Text numberOfLines={1} ellipsizeMode="tail" style={styles.titleText}>
            {title}
          </Text>

          <View style={styles.titleRight}>
            <BatteryIcon level={0.8} />
          </View>
        </>
      )}
    </View>
  );
}

export function Screen({
  width,
  height,
  paletteName = 'color',
  appTheme = DEFAULT_APP_THEME,
  glassReflection = true,
  nowPlayingLayout = 'split',
}: Props) {
  // The accent color from the active theme replaces the LCD's blue highlight
  // and progress fill, so a theme change repaints the list and progress bars
  // without touching MenuList/ProgressView.
  const palette: LcdPalette = useMemo(() => {
    const base = lcdPalettes[paletteName];
    return {
      ...base,
      highlightBackground: appTheme.accentColor,
      progressFill: appTheme.accentColor,
    };
  }, [paletteName, appTheme.accentColor]);

  const title = useMenuStore(selectTopTitle);
  const items = useMenuStore(selectTopItems);
  const selectedIndex = useMenuStore(selectTopSelectedIndex);
  const windowStart = useMenuStore(selectTopWindowStart);
  const loading = useMenuStore(selectTopLoading);
  const status = useMenuStore(selectTopStatus);
  const kind = useMenuStore(selectTopKind);
  const albumOverlay = useMenuStore(selectTopAlbumOverlay);

  const setVisibleRows = useMenuStore((s) => s.setVisibleRows);

  const bodyHeight = Math.max(
    0,
    height - spacing.titleBarHeight - (status ? spacing.statusLineHeight : 0),
  );
  const rows = visibleRowCount(bodyHeight, spacing.lcdRowHeight);

  // Keep the store's window math in sync with the real pixel height.
  useEffect(() => {
    setVisibleRows(rows);
  }, [rows, setVisibleRows]);

  // Built only for frames that actually show a list. For now-playing this is
  // null, so the list tree is never constructed.
  const listContent = useMemo(() => {
    if (kind === 'nowplaying') return null;
    if (kind === 'progress') {
      return <ProgressView width={width} height={bodyHeight} status={status} palette={palette} />;
    }
    if (kind === 'coverflow') {
      return (
        <CoverFlow
          items={items}
          selectedIndex={selectedIndex}
          width={width}
          height={bodyHeight}
          palette={palette}
          loading={loading}
          overlay={albumOverlay}
        />
      );
    }
    return (
      <MenuList
        items={items}
        selectedIndex={selectedIndex}
        windowStart={windowStart}
        visibleRows={rows}
        width={width}
        height={bodyHeight}
        palette={palette}
        loading={loading}
      />
    );
  }, [
    kind,
    items,
    selectedIndex,
    windowStart,
    rows,
    width,
    bodyHeight,
    palette,
    loading,
    status,
    albumOverlay,
  ]);

  // Now Playing owns the full body: its own themed gradient, status bar,
  // artwork, metadata, scrubber and footer. It is still wrapped in the LCD
  // viewport so the 16 pt radius + overflow clip the full-bleed gradient.
  if (kind === 'nowplaying') {
    return (
      <View style={[styles.lcd, { width, height }]}>
        <NowPlaying
          width={width}
          height={height}
          theme={appTheme}
          layout={nowPlayingLayout}
        />
        {glassReflection ? <GlassSheen width={width} height={height} /> : null}
      </View>
    );
  }

  return (
    <View style={[styles.lcd, { width, height, backgroundColor: palette.background }]}>
      <ScreenHeader
        title={title}
        width={width}
        variant={kind === 'coverflow' ? 'coverflow' : 'plain'}
      />

      {listContent}

      {/* Diagonal glass reflection, under the bezel bevel highlights. */}
      {glassReflection ? <GlassSheen width={width} height={height} /> : null}

      {status ? (
        <View style={[styles.statusLine, { height: spacing.statusLineHeight }]}>
          <Text numberOfLines={1} style={[styles.statusText, { color: palette.textDim }]}>
            {status}
          </Text>
        </View>
      ) : null}

      {/*
        Acrylic bezel bevels, drawn last so they sit above the content:
          - a 1px top/left highlight (the lit edge of a recessed pane),
          - a subtle diagonal gloss sweep across the upper-left.
        Pointer-transparent so they never eat a tap.
      */}
      <View style={styles.bevel} pointerEvents="none">
        <Svg style={StyleSheet.absoluteFill} width={width} height={height}>
          <Defs>
            <LinearGradient id="bevelGloss" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.34} />
              <Stop offset="0.45" stopColor="#FFFFFF" stopOpacity={0.08} />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
            </LinearGradient>
          </Defs>
          {/* Diagonal gloss sweep. */}
          <Path d={`M0 0 H${width} L0 ${height * 0.62} Z`} fill="url(#bevelGloss)" />
          {/* 1px top and left highlight. */}
          <Rect x={0} y={0} width={width} height={1} fill="#FFFFFF" opacity={0.7} />
          <Rect x={0} y={0} width={1} height={height} fill="#FFFFFF" opacity={0.45} />
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  lcd: {
    overflow: 'hidden',
    // The acrylic pane sits inside the thick black bezel. Every corner is
    // spelled out explicitly: Android only clips a child to the parent's
    // radius when the corner radii are non-zero on the clipping view itself.
    borderRadius: LCD_RADIUS,
    borderTopLeftRadius: LCD_RADIUS,
    borderTopRightRadius: LCD_RADIUS,
    borderBottomLeftRadius: LCD_RADIUS,
    borderBottomRightRadius: LCD_RADIUS,
  },
  titleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lcdPaddingH,
    // The header gradient is a child SVG that would otherwise square off the
    // LCD's top corners; clip it to the same curve as the pane.
    borderTopLeftRadius: LCD_RADIUS,
    borderTopRightRadius: LCD_RADIUS,
    overflow: 'hidden',
  },
  /** The header's own SVG also carries the top radii, not just its parent. */
  headerSvg: {
    borderTopLeftRadius: LCD_RADIUS,
    borderTopRightRadius: LCD_RADIUS,
    overflow: 'hidden',
  },
  titleLeft: {
    width: 22,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  titleRight: {
    width: 22,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  titleText: {
    flex: 1,
    textAlign: 'center',
    fontSize: fonts.lcdTitleSize,
    fontWeight: '700',
    color: HEADER_TEXT,
  },
  /** Cover Flow: bold title flush left, transport and battery grouped right. */
  titleTextLeft: {
    textAlign: 'left',
    fontWeight: '800',
  },
  coverFlowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  headerPlay: {
    marginRight: 6,
  },
  statusLine: {
    justifyContent: 'center',
    paddingHorizontal: spacing.lcdPaddingH,
  },
  statusText: {
    fontSize: fonts.lcdSmallSize,
  },
  bevel: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: LCD_RADIUS,
    overflow: 'hidden',
  },
});
