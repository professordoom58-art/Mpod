/**
 * The LCD list. Renders ONLY the visible window slice: no FlatList, no
 * virtualization machinery, no per-row measurement. At 20,000 rows this is
 * ~9 Text nodes, which is why a fast wheel spin stays smooth.
 *
 * Each row is a fixed height so the window math is exact.
 */

import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Row } from '../nav/menuStack';
import { fonts, spacing, type LcdPalette } from './theme';

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
  palette: LcdPalette;
};

const RowView = memo(function RowView({ row, selected, rowHeight, palette }: RowViewProps) {
  const textColor = selected ? palette.highlightText : palette.text;
  const dimColor = selected ? palette.highlightText : palette.textDim;

  return (
    <View
      style={[
        styles.row,
        { height: rowHeight },
        selected ? { backgroundColor: palette.highlightBackground } : null,
      ]}
    >
      <View style={styles.rowTextWrap}>
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
            palette={palette}
          />
        );
      })}

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
  },
  rowTextWrap: {
    flexShrink: 1,
    flexGrow: 1,
  },
  rowText: {
    fontSize: fonts.lcdRowSize,
  },
  rowTextDisabled: {
    opacity: 0.6,
  },
  rowSub: {
    fontSize: fonts.lcdSmallSize,
    marginTop: -1,
  },
  chevron: {
    fontSize: fonts.lcdRowSize,
    marginLeft: 6,
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
});
