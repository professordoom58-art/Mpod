/**
 * The LCD frame: a title bar (play indicator, centered title, battery icon)
 * and a body area that renders the current frame.
 *
 * The title bar is styled per frame kind: a light silver header on regular
 * menus, or a dark charcoal header on the Now Playing screen. All navigation
 * logic lives in the menu store; this component only renders.
 */

import { useEffect, useMemo } from 'react';
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
import { NowPlaying } from './NowPlaying';
import { ProgressView } from './ProgressView';
import { colors, fonts, lcdPalettes, spacing, type LcdPalette } from './theme';
import { visibleRowCount } from './windowing';

type Props = {
  width: number;
  height: number;
  playing: boolean;
  paletteName?: keyof typeof lcdPalettes;
};

/** Battery glyph, drawn rather than imported so it scales with the LCD. */
function BatteryIcon({ color }: { color: string }) {
  const w = 16;
  const h = 8;
  return (
    <Svg width={w + 2} height={h} viewBox={`0 0 ${w + 2} ${h}`}>
      <Rect x={0.5} y={0.5} width={w - 1} height={h - 1} rx={1.5} stroke={color} strokeWidth={1} fill="none" />
      <Rect x={w} y={h / 2 - 2} width={2} height={4} rx={0.5} fill={color} />
      <Rect x={2} y={2} width={10} height={h - 4} rx={0.5} fill={color} />
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

export function Screen({ width, height, playing, paletteName = 'color' }: Props) {
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
  useEffect(() => {
    setVisibleRows(rows);
  }, [rows, setVisibleRows]);

  // The Now Playing screen owns its own dark header, artwork and metadata, so
  // it renders as a single full-body frame without the shared title bar.
  if (kind === 'nowplaying') {
    return (
      <NowPlaying width={width} height={height} playing={playing} />
    );
  }

  // Regular menus get the light silver header; Now Playing owns its own dark one.
  const headerBg = colors.headerBg;
  const headerText = colors.headerText;
  const headerBorder = colors.headerBorder;

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
    <View style={[styles.lcd, { width, height, backgroundColor: palette.background }]}>
      <View
        style={[
          styles.titleBar,
          { height: spacing.titleBarHeight, backgroundColor: headerBg, borderBottomColor: headerBorder },
        ]}
      >
        <View style={styles.titleLeft}>
          {playing ? <PlayIndicator color={headerText} /> : null}
        </View>

        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          style={[styles.titleText, { color: headerText }]}
        >
          {title}
        </Text>

        <View style={styles.titleRight}>
          <BatteryIcon color={headerText} />
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
    overflow: 'hidden',
    borderRadius: 10,
  },
  titleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lcdPaddingH,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  titleLeft: {
    width: 22,
    alignItems: 'flex-start',
  },
  titleRight: {
    width: 22,
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
