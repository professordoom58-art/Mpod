/**
 * The iPod body: rounded shell, 4:3 LCD, and the click wheel below.
 * Everything is derived from the measured body width so the wheel stays a
 * perfect circle on any screen.
 *
 * This component is now pure layout plus gesture attachment. All navigation
 * state lives in the menu store; all library state in the library store.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';

import { initMenus, offerFirstRun, pushNowPlaying } from '../nav/menus';
import { useWheelNav } from '../nav/wheelNav';
import { setNowPlayingHandler, usePlayerStore } from '../player/store';
import { useLibraryStore } from '../library/store';
import { setHapticsEnabled } from '../haptics/haptics';
import { DebugOverlay } from './DebugOverlay';
import { Screen } from './Screen';
import { colors, layout, radii, wheel as wheelCfg } from './theme';
import { ClickWheel } from '../wheel/ClickWheel';
import { useClickWheel, type Zone } from '../wheel/useClickWheel';

type Props = {
  /** Available width from the parent (already inset-safe). */
  availableWidth: number;
  showDebug: boolean;
};

export function Body({ availableWidth, showDebug }: Props) {
  const [lastZone, setLastZone] = useState<Zone | null>(null);
  const [lastDir, setLastDir] = useState<1 | -1 | null>(null);

  const bodyWidth = Math.min(availableWidth, layout.bodyMaxWidth);
  const bodyHeight = bodyWidth / layout.bodyAspect;
  const innerWidth = bodyWidth * (1 - layout.bodyPaddingRatio * 2);

  const screenWidth = innerWidth * layout.screenWidthRatio;
  const screenHeight = screenWidth / layout.screenAspect;
  const wheelSize = innerWidth * layout.wheelDiameterRatio;

  const { onStep, onTap, onMenuLongPress } = useWheelNav();

  const playing = usePlayerStore((s) => s.playing);
  const settings = useLibraryStore((s) => s.settings);

  // Boot: open the DB, install the root menu, connect the player stub.
  useEffect(() => {
    initMenus();
    setNowPlayingHandler((track) => {
      pushNowPlaying(track);
    });

    void (async () => {
      await useLibraryStore.getState().init();
      // First launch with an empty index: offer the permission flow instead of
      // scanning silently. Never auto-scan.
      const { counts } = useLibraryStore.getState();
      if (Platform.OS === 'android' && counts.tracks === 0) {
        offerFirstRun();
      }
    })();

    return () => {
      setNowPlayingHandler(null);
    };
  }, []);

  // Apply persisted haptics preference to the haptics module once loaded.
  useEffect(() => {
    if (settings) setHapticsEnabled(settings.hapticsEnabled);
  }, [settings]);

  const tickDeg = settings?.wheelTickDeg ?? wheelCfg.tickDeg;

  const step = useCallback(
    (dir: 1 | -1) => {
      setLastDir(dir);
      onStep(dir);
    },
    [onStep],
  );

  const tap = useCallback(
    (zone: Zone) => {
      setLastZone(zone);
      onTap(zone);
    },
    [onTap],
  );

  const { gesture, debug } = useClickWheel({
    size: wheelSize,
    innerRatio: layout.wheelInnerRatio,
    tickDeg,
    onStep: step,
    onTap: tap,
    onMenuLongPress,
  });

  const lcdStyle = useMemo(
    () => ({ width: screenWidth, height: screenHeight, borderRadius: radii.screen }),
    [screenWidth, screenHeight],
  );

  return (
    <View style={{ width: bodyWidth }}>
      <View
        style={[
          styles.body,
          {
            width: bodyWidth,
            height: bodyHeight,
            paddingHorizontal: bodyWidth * layout.bodyPaddingRatio,
            borderRadius: radii.body,
          },
        ]}
      >
        <View style={[styles.lcdWrap, lcdStyle]}>
          <Screen width={screenWidth} height={screenHeight} playing={playing} />
        </View>

        {showDebug ? (
          <DebugOverlay
            angleDeg={debug.angleDeg}
            accDeg={debug.accDeg}
            steps={debug.steps}
            lastZone={lastZone}
            lastDir={lastDir}
            flushMs={80}
          />
        ) : null}

        <View style={{ height: innerWidth * layout.screenWheelGapRatio }} />

        <GestureDetector gesture={gesture}>
          <View collapsable={false}>
            <ClickWheel size={wheelSize} innerRatio={layout.wheelInnerRatio} />
          </View>
        </GestureDetector>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    backgroundColor: colors.body,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 0,
    borderWidth: 1,
    borderColor: colors.bodyEdge,
    shadowColor: colors.bodyShadow,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  lcdWrap: {
    overflow: 'hidden',
  },
});
