/**
 * Click wheel gesture math.
 *
 * The rotation algorithm below is the reference implementation, kept intact:
 * angle accumulation with wrap to (-PI, PI], one step per tickDeg, clockwise
 * = +1, worklets on the UI thread, only onStep/onTap crossing to JS.
 *
 * Things added on top of the reference behaviour:
 *
 * 1. Gestures are built ONCE (useMemo) and never rebuilt on render. Callbacks
 *    are held in refs so a re-render cannot recreate the gesture objects, which
 *    used to drop an in-flight pan mid-spin.
 * 2. Ring-slip guard: if the finger leaves the ring and comes back, the angle
 *    is re-seeded instead of being accumulated across the gap. Without this a
 *    finger sliding over the center button produced one huge phantom jump.
 * 3. Tap dead zones: 10 degrees either side of each sector boundary resolves
 *    to no zone, so a tap near a boundary does nothing instead of firing the
 *    wrong button.
 * 4. Long-press MENU (500 ms) is raced ahead of tap, so holding MENU jumps to
 *    the root menu instead of also registering a short press.
 * 5. Long-press NEXT/PREV (350 ms) starts fast-forward/rewind. The seek loop
 *    itself lives on the JS thread (see nav/wheelNav.ts); this gesture only
 *    reports press start and release, and it wins the race, so releasing after
 *    a hold never also fires a track skip.
 *
 * The debug shared values (dbg*) are read-only for the overlay and never
 * influence control flow.
 */

import { useCallback, useMemo, useRef } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue, type SharedValue } from 'react-native-reanimated';

import { timing } from '../ui/theme';

export type Zone = 'menu' | 'next' | 'prev' | 'play' | 'select';

/** Sectors that support hold-to-seek. */
export type SeekZone = 'next' | 'prev';

type Opts = {
  size: number;
  innerRatio?: number;
  tickDeg?: number;
  onStep: (dir: 1 | -1) => void;
  onTap: (zone: Zone) => void;
  /** Optional long-press on the Menu zone (jump to main menu). */
  onMenuLongPress?: () => void;
  /** Hold on Next/Prev passed the hold threshold: start seeking. */
  onSeekStart?: (zone: SeekZone) => void;
  /** Finger released (or the gesture was cancelled): stop seeking. */
  onSeekEnd?: () => void;
};

const TAU = Math.PI * 2;

const wrap = (d: number) => {
  'worklet';
  return d > Math.PI ? d - TAU : d < -Math.PI ? d + TAU : d;
};

const RAD_TO_DEG = 180 / Math.PI;

/** Half-width of the dead zone around each sector boundary, in degrees. */
const DEAD_ZONE_DEG = 10;

/** Hold time before Next/Prev becomes fast-forward/rewind. */
const SEEK_HOLD_MS = timing.seekHoldMs;

/**
 * Resolves an angle in degrees to a tap zone, or null inside a dead zone.
 *
 * Boundaries sit at -135, -45, 45 and 135 degrees. A tap within DEAD_ZONE_DEG
 * of any boundary returns null so the caller does nothing.
 */
function zoneForAngle(a: number): Zone | null {
  'worklet';
  const boundaries = [-135, -45, 45, 135];
  for (let i = 0; i < boundaries.length; i += 1) {
    if (Math.abs(a - boundaries[i]) <= DEAD_ZONE_DEG) return null;
  }

  if (a > -135 && a <= -45) return 'menu';
  if (a > -45 && a <= 45) return 'next';
  if (a > 45 && a <= 135) return 'play';
  return 'prev';
}

/**
 * Hold zone for seek: Next and Prev sectors only, ignoring the tap dead zones
 * (a deliberate hold is not an accidental boundary tap).
 */
function seekZoneFor(x: number, y: number, c: number, inner: number): SeekZone | null {
  'worklet';
  const dx = x - c;
  const dy = y - c;
  const r = Math.hypot(dx, dy);
  if (r > c || r <= inner) return null;
  const a = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (a > -45 && a <= 45) return 'next';
  if (a > 135 || a <= -135) return 'prev';
  return null;
}

export function useClickWheel({
  size,
  innerRatio = 0.36,
  tickDeg = 15,
  onStep,
  onTap,
  onMenuLongPress,
  onSeekStart,
  onSeekEnd,
}: Opts) {
  const c = size / 2;
  const inner = c * innerRatio;
  const tick = (tickDeg * Math.PI) / 180;

  const last = useSharedValue(0);
  const acc = useSharedValue(0);
  const valid = useSharedValue(false);
  /** True while the finger is inside the ring annulus. */
  const wasInRing = useSharedValue(false);

  // Debug instrumentation (read-only for the overlay).
  const dbgAngleDeg = useSharedValue(0);
  const dbgAccDeg = useSharedValue(0);
  const dbgSteps = useSharedValue(0);

  // Callbacks live in refs so the gesture objects below can be built once.
  // Reanimated's useSharedValue cannot hold a function type, so the worklets
  // call the stable trampolines below instead, and those read the refs on the
  // JS thread. This keeps onStep/onTap out of the gesture dependencies.
  const stepRef = useRef(onStep);
  const tapRef = useRef(onTap);
  const longPressRef = useRef(onMenuLongPress);
  const seekStartRef = useRef(onSeekStart);
  const seekEndRef = useRef(onSeekEnd);

  stepRef.current = onStep;
  tapRef.current = onTap;
  longPressRef.current = onMenuLongPress;
  seekStartRef.current = onSeekStart;
  seekEndRef.current = onSeekEnd;

  const invokeStep = useCallback((dir: 1 | -1) => {
    stepRef.current(dir);
  }, []);

  const invokeTap = useCallback((zone: Zone) => {
    tapRef.current(zone);
  }, []);

  const invokeLongPress = useCallback(() => {
    longPressRef.current?.();
  }, []);

  const invokeSeekStart = useCallback((zone: SeekZone) => {
    seekStartRef.current?.(zone);
  }, []);

  const invokeSeekEnd = useCallback(() => {
    seekEndRef.current?.();
  }, []);

  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .minDistance(4)
      .onBegin((e) => {
        const r = Math.hypot(e.x - c, e.y - c);
        const inRing = r > inner && r < c;
        valid.value = inRing;
        wasInRing.value = inRing;
        last.value = Math.atan2(e.y - c, e.x - c);
        acc.value = 0;
        dbgAngleDeg.value = last.value * RAD_TO_DEG;
        dbgAccDeg.value = 0;
      })
      .onUpdate((e) => {
        if (!valid.value) return;

        const r = Math.hypot(e.x - c, e.y - c);
        const inRing = r > inner && r < c;

        // Ring-slip guard: the finger left the annulus (over the center button
        // or off the wheel) and has now come back. Re-seed the reference angle
        // and add nothing, so the gap contributes no rotation.
        if (!inRing) {
          wasInRing.value = false;
          return;
        }
        if (!wasInRing.value) {
          wasInRing.value = true;
          last.value = Math.atan2(e.y - c, e.x - c);
          dbgAngleDeg.value = last.value * RAD_TO_DEG;
          return;
        }

        const th = Math.atan2(e.y - c, e.x - c);
        acc.value += wrap(th - last.value);
        last.value = th;
        dbgAngleDeg.value = th * RAD_TO_DEG;
        while (acc.value >= tick) {
          acc.value -= tick;
          dbgSteps.value += 1;
          runOnJS(invokeStep)(1);
        }
        while (acc.value <= -tick) {
          acc.value += tick;
          dbgSteps.value += 1;
          runOnJS(invokeStep)(-1);
        }
        dbgAccDeg.value = acc.value * RAD_TO_DEG;
      });

    const tap = Gesture.Tap()
      .maxDistance(8)
      .onEnd((e, ok) => {
        if (!ok) return;
        const dx = e.x - c;
        const dy = e.y - c;
        const r = Math.hypot(dx, dy);
        if (r > c) return;
        if (r <= inner) {
          runOnJS(invokeTap)('select');
          return;
        }
        const a = (Math.atan2(dy, dx) * 180) / Math.PI;
        const zone = zoneForAngle(a);
        // null means the tap landed in a dead zone: deliberately no action.
        if (zone === null) return;
        runOnJS(invokeTap)(zone);
      });

    const longPressMenu = Gesture.LongPress()
      .minDuration(500)
      .maxDistance(8)
      .onStart((e) => {
        const dx = e.x - c;
        const dy = e.y - c;
        const r = Math.hypot(dx, dy);
        if (r > c || r <= inner) return;
        const a = (Math.atan2(dy, dx) * 180) / Math.PI;
        // Menu sector, ignoring the dead zone: a long press is deliberate.
        const isMenu = a > -135 && a <= -45;
        if (isMenu) runOnJS(invokeLongPress)();
      });

    /**
     * Hold-to-seek on Next/Prev. `onTouchesDown` fails the gesture immediately
     * when the finger is anywhere else, so it can never steal the 500 ms MENU
     * long-press or the center Select hold from the race below.
     */
    const longPressSeek = Gesture.LongPress()
      .minDuration(SEEK_HOLD_MS)
      .maxDistance(10)
      .onTouchesDown((e, manager) => {
        const touch = e.allTouches[0];
        if (!touch || seekZoneFor(touch.x, touch.y, c, inner) === null) {
          manager.fail();
        }
      })
      .onStart((e) => {
        const zone = seekZoneFor(e.x, e.y, c, inner);
        if (zone !== null) runOnJS(invokeSeekStart)(zone);
      })
      .onFinalize(() => {
        // Fires on release and on cancellation. Harmless when no seek is
        // running (a short tap fails this gesture before it activates).
        runOnJS(invokeSeekEnd)();
      });

    // LongPress gestures must win over Tap when they fire, so they are raced
    // first. Only one of the two can activate: each fails itself outside its
    // own sectors.
    return Gesture.Race(longPressSeek, longPressMenu, pan, tap);
    // Only geometry changes rebuild the gesture; the callbacks are stable
    // trampolines that read refs, so they are safe dependencies.
  }, [c, inner, tick, invokeStep, invokeTap, invokeLongPress, invokeSeekStart, invokeSeekEnd]);

  const debug: ClickWheelDebugValues = useMemo(
    () => ({ angleDeg: dbgAngleDeg, accDeg: dbgAccDeg, steps: dbgSteps }),
    [dbgAngleDeg, dbgAccDeg, dbgSteps],
  );

  return { gesture, debug };
}

/**
 * Read-only shared values for the debug overlay. These are additive: the
 * rotation algorithm above is unchanged, these are only written alongside it.
 */
export type ClickWheelDebugValues = {
  angleDeg: SharedValue<number>;
  accDeg: SharedValue<number>;
  steps: SharedValue<number>;
};
