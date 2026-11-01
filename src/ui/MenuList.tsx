/**
 * The LCD list. Renders ONLY the visible window slice: no FlatList, no
 * virtualization machinery, no per-row measurement. At 20,000 rows this is
 * ~9 rows, which is why a fast wheel spin stays smooth.
 *
 * Each row is a fixed height so the window math is exact.
 *
 * The selected row is an authentic glossy iPod pill: a three-stop vertical
 * gradient derived from the active theme's accent color, a 1px light top edge
 * and a 1px dark bottom edge, drawn with react-native-svg behind crisp white
 * text. No Platform branching.
 */

import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { selectJumpLetter, useMenuStore, type Row } from '../nav/menuStack';
import { MarqueeText } from './MarqueeText';
import { fonts, spacing, darkenHex, lightenHex, type LcdPalette } from './theme';

/** Labels longer than this scroll instead of being truncated. */
const MARQUEE_CHARS = 26;
/** The A-Z jump HUD is a fixed square. */
const JUMP_HUD_SIZE = 44;

const PILL_TOP_HIGHLIGHT = 'rgba(255,255,255,0.45)';
const PILL_TEXT = '#FFFFFF';

type Props = {
  items: Row[];
  selectedIndex: number;
  windowStart: number;
  visibleRows: number;
  width: number;
  height: number;
  palette: LcdPalette;
  /** Shown instead of rows while a loader is pending. */
  loading?: boolean;
};

type RowViewProps = {
  row: Row;
  selected: boolean;
  rowHeight: number;
  width: number;
  palette: LcdPalette;
  /** Accent used for the selection pill gradient. */
  accent: string;
};

/**
 * The selection pill. Drawn as an absolutely-positioned SVG layer so the text
 * above it stays a plain <Text> with no gradient clipping quirks. The three
 * stops are derived from the theme accent (blue by default), so a custom theme
 * recolors the pill with no extra plumbing.
 */
function SelectionPill({
  width,
  height,
  accent,
}: {
  width: number;
  height: number;
  accent: string;
}) {
  return (
    <Svg style={StyleSheet.absoluteFill} width={width} height={height}>
      <Defs>
        <LinearGradient id="pillAccent" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={lightenHex(accent, 0.18)} />
          <Stop offset="0.5" stopColor={accent} />
          <Stop offset="1" stopColor={darkenHex(accent, 0.22)} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill="url(#pillAccent)" />
      {/* 1px top highlight: the lit edge of a convex pill. */}
      <Rect x={0} y={0} width={width} height={1} fill={PILL_TOP_HIGHLIGHT} />
      {/* 1px bottom edge: the shadowed underside. */}
      <Rect x={0} y={height - 1} width={width} height={1} fill={darkenHex(accent, 0.42)} />
    </Svg>
  );
}

const RowView = memo(function RowView({
  row,
  selected,
  rowHeight,
  width,
  palette,
  accent,
}: RowViewProps) {
  const textColor = selected ? PILL_TEXT : palette.text;
  const dimColor = selected ? PILL_TEXT : palette.textDim;

  return (
    <View style={[styles.row, { height: rowHeight, width }]}>
      {selected ? <SelectionPill width={width} height={rowHeight} accent={accent} /> : null}

      <View style={styles.rowTextWrap}>
        {selected && row.label.length > MARQUEE_CHARS ? (
          <MarqueeText
            text={row.label}
            style={[
              styles.rowText,
              { color: row.disabled ? dimColor : textColor },
              row.disabled ? styles.rowTextDisabled : null,
            ]}
          />
        ) : (
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={[
              styles.rowText,
              { color: row.disabled ? dimColor : textColor },
              row.disabled ? styles.rowTextDisabled : null,
            ]}
          >
            {row.label}
          </Text>
        )}
        {row.sub ? (
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={[styles.rowSub, { color: dimColor }]}
          >
            {row.sub}
          </Text>
        ) : null}
      </View>

      {row.chevron ? (
        <Text style={[styles.chevron, { color: dimColor }]}>{'\u203A'}</Text>
      ) : null}
    </View>
  );
});

export function MenuList({
  items,
  selectedIndex,
  windowStart,
  visibleRows,
  width,
  height,
  palette,
  loading,
}: Props) {
  // Accelerated-scroll HUD. Subscribed here rather than in Screen so the
  // letter changes re-render the list only, never the header or the wheel.
  const jumpLetter = useMenuStore(selectJumpLetter);

  const rowHeight = spacing.lcdRowHeight;
  const total = items.length;

  if (loading) {
    return (
      <View style={{ width, height }}>
        <View style={[styles.row, { height: rowHeight }]}>
          <Text style={[styles.rowText, { color: palette.textDim }]}>Loading...</Text>
        </View>
      </View>
    );
  }

  const start = Math.max(0, Math.min(windowStart, Math.max(0, total - 1)));
  const slice = items.slice(start, start + visibleRows);

  // Scrollbar geometry. Hidden entirely when everything fits.
  const showScrollbar = total > visibleRows;
  const trackHeight = Math.max(0, height - spacing.scrollbarInset * 2);
  const thumbRatio = Math.min(1, visibleRows / Math.max(1, total));
  const thumbHeight = Math.max(8, trackHeight * thumbRatio);
  const maxStart = Math.max(1, total - visibleRows);
  const thumbTop = (Math.min(start, maxStart) / maxStart) * (trackHeight - thumbHeight);

  return (
    <View style={{ width, height }}>
      {slice.map((row, i) => {
        const index = start + i;
        return (
          <RowView
            key={row.id}
            row={row}
            selected={index === selectedIndex}
            rowHeight={rowHeight}
            width={width}
            palette={palette}
            accent={palette.highlightBackground}
          />
        );
      })}

      {/* Alphabet jump HUD, centred over the list while spinning fast. */}
      {jumpLetter ? (
        <View
          style={[
            styles.jumpHud,
            {
              width: JUMP_HUD_SIZE,
              height: JUMP_HUD_SIZE,
              borderRadius: 8,
              top: Math.max(0, (height - JUMP_HUD_SIZE) / 2),
              left: Math.max(0, (width - JUMP_HUD_SIZE) / 2),
            },
          ]}
          pointerEvents="none"
        >
          <Text style={styles.jumpLetter}>{jumpLetter}</Text>
        </View>
      ) : null}

      {showScrollbar ? (
        <View
          style={[
            styles.scrollbarTrack,
            {
              height: trackHeight,
              top: spacing.scrollbarInset,
              backgroundColor: palette.scrollbarTrack,
            },
          ]}
          pointerEvents="none"
        >
          <View
            style={[
              styles.scrollbarThumb,
              {
                height: thumbHeight,
                top: thumbTop,
                backgroundColor: palette.scrollbarThumb,
              },
            ]}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lcdPaddingH,
    overflow: 'hidden',
  },
  rowTextWrap: {
    flexShrink: 1,
    flexGrow: 1,
  },
  rowText: {
    fontSize: fonts.lcdRowSize,
    fontWeight: '600',
  },
  rowTextDisabled: {
    opacity: 0.5,
  },
  rowSub: {
    fontSize: fonts.lcdSmallSize,
    marginTop: -1,
    fontWeight: '400',
  },
  chevron: {
    fontSize: fonts.lcdRowSize,
    marginLeft: 6,
    fontWeight: '700',
  },
  scrollbarTrack: {
    position: 'absolute',
    right: spacing.scrollbarInset,
    width: spacing.scrollbarWidth,
    borderRadius: spacing.scrollbarWidth / 2,
    overflow: 'hidden',
  },
  scrollbarThumb: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderRadius: spacing.scrollbarWidth / 2,
  },
  jumpHud: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  jumpLetter: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '700',
  },
});
