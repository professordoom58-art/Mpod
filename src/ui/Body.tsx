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
  isDarkHex,
  layout,
  radii,
  resolveAppTheme,
  spacing,
  wheel as wheelCfg,
} from './theme';
import { ClickWheel } from '../wheel/ClickWheel';
import { useClickWheel } from '../wheel/useClickWheel';

/** Chassis breathing room above the screen bezel, below the notch/status bar. */
const CHASSIS_TOP_PAD = 10;
/** Chassis breathing room below the wheel, above the home indicator. */
const CHASSIS_BOTTOM_PAD = 28;

type Props = {
  /** Available width from the parent (already inset-safe). */
  availableWidth: number;
  /** Available height from the parent (already inset-safe). */
  availableHeight: number;
  showDebug: boolean;
};

export function Body({ availableWidth, availableHeight, showDebug }: Props) {
  // Edge-to-edge geometry: the BLACK BEZEL spans 93% of the phone width (so the
  // LCD inside it keeps a 12-14 pt chassis margin), the wheel sits in the lower
  // thumb zone at ~76% of the phone width. Everything shrinks proportionally in
  // the rare case that the stack would overflow a short viewport.
  const { bezelWidth, screenWidth, screenHeight, wheelSize } = useMemo(() => {
    let bw = Math.min(availableWidth * layout.screenWidthRatio, layout.screenMaxWidth);
    let sw = Math.max(0, bw - spacing.bezelPadding * 2);
    let sh = sw / layout.screenAspect;
    let wheel = Math.min(availableWidth * layout.wheelDiameterRatio, layout.wheelMaxDiameter);

    const innerHeight = Math.max(
      0,
      availableHeight - (CHASSIS_TOP_PAD + CHASSIS_BOTTOM_PAD),
    );
    const bezelHeight = sh + spacing.bezelPadding * 2;
    const needed = bezelHeight + layout.screenWheelGap + wheel;
    if (needed > innerHeight && needed > 0) {
      const scale = innerHeight / needed;
      bw *= scale;
      sw = Math.max(0, bw - spacing.bezelPadding * 2);
      sh = sw / layout.screenAspect;
      wheel *= scale;
    }

    return { bezelWidth: bw, screenWidth: sw, screenHeight: sh, wheelSize: wheel };
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

  // A preset with `shellGradient` is painted full-screen by App.tsx, so this
  // chassis must stay transparent or it would cover the finish with the flat
  // fallback color. Presets without one keep the old flat shell.
  const chassisBackground = appTheme.shellGradient ? 'transparent' : appTheme.shellColor;

  // Optional Select-button face from the preset. ClickWheel paints the disc in
  // this color and keeps the outer ring crisp white.
  const centerButtonColor = appTheme.centerButtonBg;

  // Metallic chamfer around the outer bezel: a 1.5 pt lit rim. Brighter on
  // light shells where it reads as polished aluminium, dimmer on dark shells
  // where a strong white edge would look like a scratch.
  const chamferColor = isDarkHex(appTheme.shellColor)
    ? 'rgba(255,255,255,0.14)'
    : 'rgba(255,255,255,0.35)';

  return (
    <View
      style={[
        styles.chassis,
        { width: availableWidth, height: availableHeight, backgroundColor: chassisBackground },
      ]}
    >
      {/*
        Two children, space-between: the screen is pinned to the top of the
        safe area and the wheel to the bottom thumb zone, so the leftover height
        becomes one gap instead of two dead bands above and below the screen.
      */}
      <View style={styles.stack}>
        <View
          style={[
            styles.bezel,
            {
              width: bezelWidth,
              borderRadius: radii.bezel,
              padding: spacing.bezelPadding,
            },
          ]}
        >
          <Screen
            width={screenWidth}
            height={screenHeight}
            appTheme={appTheme}
            glassReflection={settings?.glassReflection ?? true}
            nowPlayingLayout={settings?.nowPlayingLayout ?? 'split'}
          />

          {/* Chamfer lip: drawn last and pointer-transparent so it sits on the
              outer edge of the black bezel without affecting layout. */}
          <View
            pointerEvents="none"
            style={[
              styles.chamfer,
              { borderRadius: radii.bezel, borderColor: chamferColor },
            ]}
          />
        </View>

        <GestureDetector gesture={gesture}>
          <View collapsable={false}>
            <ClickWheel
              size={wheelSize}
              innerRatio={layout.wheelInnerRatio}
              wheelColor={appTheme.wheelColor}
              wheelTextColor={appTheme.wheelTextColor}
              centerButtonColor={centerButtonColor}
            />
          </View>
        </GestureDetector>
      </View>

      {showDebug ? (
        <View style={styles.debug} pointerEvents="none">
          <DebugOverlay
            angleDeg={debug.angleDeg}
            accDeg={debug.accDeg}
            steps={debug.steps}
            flushMs={80}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chassis: {
    backgroundColor: colors.chassisBg,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  stack: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: CHASSIS_TOP_PAD,
    paddingBottom: CHASSIS_BOTTOM_PAD,
  },
  bezel: {
    // Thick black acrylic frame: 24 pt outer radius, 10 pt padding, inner LCD
    // gets its own 16 pt radius. `overflow: hidden` guarantees no square child
    // corner (header SVG, Now Playing gradient) can poke out of the frame.
    backgroundColor: '#0a0a0a',
    borderColor: colors.bezelEdge,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  /** 1.5 pt metallic rim around the outer bezel (Reference 1 chamfer). */
  chamfer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 1.5,
  },
  /** Debug readout floats over the chassis and never joins the flex column. */
  debug: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: CHASSIS_BOTTOM_PAD,
  },
});
