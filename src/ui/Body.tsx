/**
 * The iPod face: no outer shell. The whole viewport is the anodized-aluminum
 * chassis, with just two vertically centred elements:
 *   1. the LCD screen inside a thick black rounded bezel, and
 *   2. the click wheel below it.
 *
 * All wheel/gesture wiring, haptics and boot logic are unchanged; this file
 * only controls layout and rendering.
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
import { colors, layout, radii, spacing, wheel as wheelCfg } from './theme';
import { ClickWheel } from '../wheel/ClickWheel';
import { useClickWheel, type Zone } from '../wheel/useClickWheel';

type Props = {
  /** Available width from the parent (already inset-safe). */
  availableWidth: number;
  /** Available height from the parent (already inset-safe). */
  availableHeight: number;
  showDebug: boolean;
};

export function Body({ availableWidth, availableHeight, showDebug }: Props) {
  const [lastZone, setLastZone] = useState<Zone | null>(null);
  const [lastDir, setLastDir] = useState<1 | -1 | null>(null);

  // Sizes, capped, and scaled down if the stack would overflow the height.
  const { screenWidth, screenHeight, wheelSize } = useMemo(() => {
    let sw = Math.min(availableWidth * layout.screenWidthRatio, layout.screenMaxWidth);
    let sh = sw / layout.screenAspect;
    let wheel = Math.min(availableWidth * layout.wheelDiameterRatio, layout.wheelMaxDiameter);

    const bezelHeight = sh + spacing.bezelPadding * 2;
    const needed = bezelHeight + layout.screenWheelGap + wheel;
    if (needed > availableHeight && needed > 0) {
      const scale = availableHeight / needed;
      sw *= scale;
      sh = sw / layout.screenAspect;
      wheel *= scale;
    }

    return { screenWidth: sw, screenHeight: sh, wheelSize: wheel };
  }, [availableWidth, availableHeight]);

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

  return (
    <View
      style={[styles.chassis, { width: availableWidth, height: availableHeight }]}
    >
      <View style={styles.stack}>
        {/* Equals 1 equal-height segment above the screen. */}
        <View style={styles.pusher} />
        <View style={[styles.bezel, { width: screenWidth + spacing.bezelPadding * 2, borderRadius: radii.bezel }]}>
          <Screen width={screenWidth} height={screenHeight} playing={playing} />
        </View>

        <View style={{ height: layout.screenWheelGap }} />

        <GestureDetector gesture={gesture}>
          <View collapsable={false}>
            <ClickWheel size={wheelSize} innerRatio={layout.wheelInnerRatio} />
          </View>
        </GestureDetector>
        <View style={styles.pusher} />

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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chassis: {
    backgroundColor: colors.chassisBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stack: {
    alignItems: 'center',
  },
  pusher: {
    flex: 1,
  },
  bezel: {
    backgroundColor: colors.bezel,
    borderColor: colors.bezelEdge,
    padding: spacing.bezelPadding,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
