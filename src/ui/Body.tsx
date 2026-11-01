/**
 * The iPod face: no outer shell. The whole viewport is the anodized-aluminum
 * chassis, with just two vertically centred elements:
 *   1. the LCD screen inside a thick black rounded bezel, and
 *   2. the click wheel below it.
 *
 * PERFORMANCE CONTRACT: this component must never re-render on a wheel step or
 * on a playback state change. That is why it holds no selection state, no
 * last-zone state, and no player-store subscription. Everything that changes
 * per step lives in the menu store (read by MenuList/Screen through selectors)
 * and everything playback-related is subscribed to inside the header that
 * actually displays it.
 *
 * The now-playing handler is installed once in App.tsx. Installing it here as
 * well meant two subscribers racing to push the same frame.
 */

import { useCallback, useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';

import { initMenus, offerFirstRun, resumeLastSession } from '../nav/menus';
import { useWheelNav } from '../nav/wheelNav';
import { useLibraryStore } from '../library/store';
import { setHapticsEnabled } from '../haptics/haptics';
import { DebugOverlay } from './DebugOverlay';
import { Screen } from './Screen';
import {
  colors,
  layout,
  radii,
  resolveAppTheme,
  spacing,
  wheel as wheelCfg,
} from './theme';
import { ClickWheel } from '../wheel/ClickWheel';
import { useClickWheel } from '../wheel/useClickWheel';

type Props = {
  /** Available width from the parent (already inset-safe). */
  availableWidth: number;
  /** Available height from the parent (already inset-safe). */
  availableHeight: number;
  showDebug: boolean;
};

export function Body({ availableWidth, availableHeight, showDebug }: Props) {
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

  const { onStep, onTap, onMenuLongPress, onSeekStart, onSeekEnd } = useWheelNav();

  // Only the persisted settings object is subscribed here, and it changes when
  // the user edits a setting, never on a wheel step.
  const settings = useLibraryStore((s) => s.settings);

  // Boot: open the DB and install the root menu.
  useEffect(() => {
    initMenus();

    void (async () => {
      await useLibraryStore.getState().init();
      // First launch with an empty index: offer the permission flow instead of
      // scanning silently. offerFirstRun() decides whether this platform has a
      // scannable device library, so no platform check is needed here.
      const { counts } = useLibraryStore.getState();
      if (counts.tracks === 0) {
        offerFirstRun();
      } else {
        // Cold-boot resume: preload the last track paused at its saved
        // position so Now Playing is on the Main Menu and Play resumes.
        await resumeLastSession();
      }
    })();
  }, []);

  // Apply persisted haptics preference to the haptics module once loaded.
  useEffect(() => {
    if (settings) setHapticsEnabled(settings.hapticsEnabled);
  }, [settings]);

  const tickDeg = settings?.wheelTickDeg ?? wheelCfg.tickDeg;

  // These wrappers exist only to keep the callback identity stable for the
  // memoized gestures. They deliberately set no component state.
  const step = useCallback(
    (dir: 1 | -1) => {
      onStep(dir);
    },
    [onStep],
  );

  const tap = useCallback(
    (zone: Parameters<typeof onTap>[0]) => {
      onTap(zone);
    },
    [onTap],
  );

  // Fast-forward / rewind hold. Kept as stable wrappers for the memoized
  // gestures, exactly like step/tap above.
  const seekStart = useCallback(
    (zone: 'next' | 'prev') => {
      onSeekStart(zone);
    },
    [onSeekStart],
  );

  const seekEnd = useCallback(() => {
    onSeekEnd();
  }, [onSeekEnd]);

  const { gesture, debug } = useClickWheel({
    size: wheelSize,
    innerRatio: layout.wheelInnerRatio,
    tickDeg,
    onStep: step,
    onTap: tap,
    onMenuLongPress,
    onSeekStart: seekStart,
    onSeekEnd: seekEnd,
  });

  // Active theme. Subscribed through `settings`, so changing it in Settings
  // retints the shell, the wheel and the screen without a relaunch.
  const appTheme = resolveAppTheme(settings?.themeId, settings?.customTheme);

  return (
    <View
      style={[
        styles.chassis,
        { width: availableWidth, height: availableHeight, backgroundColor: appTheme.shellColor },
      ]}
    >
      <View style={styles.stack}>
        {/* Equals 1 equal-height segment above the screen. */}
        <View style={styles.pusher} />
        <View
          style={[
            styles.bezel,
            { width: screenWidth + spacing.bezelPadding * 2, borderRadius: radii.bezel },
          ]}
        >
          <Screen width={screenWidth} height={screenHeight} appTheme={appTheme} />
        </View>

        <View style={{ height: layout.screenWheelGap }} />

        <GestureDetector gesture={gesture}>
          <View collapsable={false}>
            <ClickWheel
              size={wheelSize}
              innerRatio={layout.wheelInnerRatio}
              wheelColor={appTheme.wheelColor}
              wheelTextColor={appTheme.wheelTextColor}
            />
          </View>
        </GestureDetector>
        <View style={styles.pusher} />

        {showDebug ? (
          <DebugOverlay
            angleDeg={debug.angleDeg}
            accDeg={debug.accDeg}
            steps={debug.steps}
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
