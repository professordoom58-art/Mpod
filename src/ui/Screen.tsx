/**
 * The LCD frame: fixed 4:3 body with a title bar (play indicator, centered
 * title, battery icon) and a body area that renders the current frame.
 *
 * This component owns no navigation logic. It reads the top frame through
 * narrow selectors and renders it.
 */

import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import {
  selectTopItems,
  selectTopKind,
  selectTopLoading,
  selectTopSelectedIndex,
  selectTopStatus,
  selectTopTitle,
  selectTopWindowStart,
  useMenuStore,
} from '../nav/menuStack';
import { MenuList } from './MenuList';
import { ProgressView } from './ProgressView';
import {
  DEFAULT_LCD_PALETTE,
  fonts,
  lcdPalettes,
  spacing,
  type LcdPalette,
  type LcdPaletteName,
} from './theme';
import { visibleRowCount } from './windowing';

type Props = {
  width: number;
  height: number;
  playing: boolean;
  paletteName?: LcdPaletteName;
};

/** Battery glyph, drawn rather than imported so it scales with the LCD. */
function BatteryIcon({ color, level }: { color: string; level: number }) {
  const w = 16;
  const h = 8;
  const fillWidth = Math.max(1, Math.round((w - 4) * Math.min(1, Math.max(0, level))));

  return (
    <Svg width={w + 2} height={h} viewBox={`0 0 ${w + 2} ${h}`}>
      <Rect x={0.5} y={0.5} width={w - 1} height={h - 1} rx={1.5} stroke={color} strokeWidth={1} fill="none" />
      <Rect x={w} y={h / 2 - 2} width={2} height={4} rx={0.5} fill={color} />
      <Rect x={2} y={2} width={fillWidth} height={h - 4} rx={0.5} fill={color} />
    </Svg>
  );
}

/** Small play triangle shown while audio is running. */
function PlayIndicator({ color }: { color: string }) {
  return (
    <Svg width={8} height={9} viewBox="0 0 8 9">
      <Path d="M0 0 L8 4.5 L0 9 Z" fill={color} />
    </Svg>
  );
}

export function Screen({ width, height, playing, paletteName = DEFAULT_LCD_PALETTE }: Props) {
  const palette: LcdPalette = lcdPalettes[paletteName];

  const title = useMenuStore(selectTopTitle);
  const items = useMenuStore(selectTopItems);
  const selectedIndex = useMenuStore(selectTopSelectedIndex);
  const windowStart = useMenuStore(selectTopWindowStart);
  const loading = useMenuStore(selectTopLoading);
  const status = useMenuStore(selectTopStatus);
  const kind = useMenuStore(selectTopKind);

  const setVisibleRows = useMenuStore((s) => s.setVisibleRows);

  const bodyHeight = Math.max(
    0,
    height - spacing.titleBarHeight - (status ? spacing.statusLineHeight : 0),
  );
  const rows = visibleRowCount(bodyHeight, spacing.lcdRowHeight);

  // Keep the store's window math in sync with the real pixel height.
  React.useEffect(() => {
    setVisibleRows(rows);
  }, [rows, setVisibleRows]);

  const content = useMemo(() => {
    if (kind === 'progress') {
      return <ProgressView width={width} height={bodyHeight} status={status} palette={palette} />;
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
  ]);

  return (
    <View
      style={[
        styles.lcd,
        { width, height, backgroundColor: palette.background, borderColor: palette.border },
      ]}
    >
      <View
        style={[
          styles.titleBar,
          { height: spacing.titleBarHeight, borderBottomColor: palette.titleBarBorder },
        ]}
      >
        <View style={styles.titleLeft}>
          {playing ? <PlayIndicator color={palette.text} /> : null}
        </View>

        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          style={[styles.titleText, { color: palette.text }]}
        >
          {title}
        </Text>

        <View style={styles.titleRight}>
          <BatteryIcon color={palette.textDim} level={0.8} />
        </View>
      </View>

      {content}

      {status ? (
        <View style={[styles.statusLine, { height: spacing.statusLineHeight }]}>
          <Text numberOfLines={1} style={[styles.statusText, { color: palette.textDim }]}>
            {status}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  lcd: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  titleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lcdPaddingH,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  titleLeft: {
    width: 20,
    alignItems: 'flex-start',
  },
  titleRight: {
    width: 20,
    alignItems: 'flex-end',
  },
  titleText: {
    flex: 1,
    textAlign: 'center',
    fontSize: fonts.lcdTitleSize,
    fontWeight: '700',
  },
  statusLine: {
    justifyContent: 'center',
    paddingHorizontal: spacing.lcdPaddingH,
  },
  statusText: {
    fontSize: fonts.lcdSmallSize,
  },
});
