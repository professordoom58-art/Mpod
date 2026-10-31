/**
 * Click wheel gesture math.
 *
 * The rotation algorithm below is the reference implementation, kept intact:
 * angle accumulation with wrap to (-PI, PI], one step per tickDeg, clockwise
 * = +1, worklets on the UI thread, only onStep/onTap crossing to JS.
 *
 * The only additions are read-only debug shared values (dbg*) so the overlay
 * can display angle / accumulator / step count. They are written alongside the
 * existing assignments and never influence control flow.
 */

import { Gesture } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue, type SharedValue } from 'react-native-reanimated';

export type Zone = 'menu' | 'next' | 'prev' | 'play' | 'select';

type Opts = {
  size: number;
  innerRatio?: number;
  tickDeg?: number;
  onStep: (dir: 1 | -1) => void;
  onTap: (zone: Zone) => void;
  /** Optional long-press on the Menu zone (jump to main menu). */
  onMenuLongPress?: () => void;
};

const TAU = Math.PI * 2;

const wrap = (d: number) => {
  'worklet';
  return d > Math.PI ? d - TAU : d < -Math.PI ? d + TAU : d;
};

const RAD_TO_DEG = 180 / Math.PI;

export function useClickWheel({
  size,
  innerRatio = 0.36,
  tickDeg = 15,
  onStep,
  onTap,
  onMenuLongPress,
}: Opts) {
  const c = size / 2;
  const inner = c * innerRatio;
  const tick = (tickDeg * Math.PI) / 180;

  const last = useSharedValue(0);
  const acc = useSharedValue(0);
  const valid = useSharedValue(false);

  // Debug instrumentation (read-only for the overlay).
  const dbgAngleDeg = useSharedValue(0);
  const dbgAccDeg = useSharedValue(0);
  const dbgSteps = useSharedValue(0);

  const pan = Gesture.Pan()
    .minDistance(4)
    .onBegin((e) => {
      const r = Math.hypot(e.x - c, e.y - c);
      valid.value = r > inner && r < c;
      last.value = Math.atan2(e.y - c, e.x - c);
      acc.value = 0;
      dbgAngleDeg.value = last.value * RAD_TO_DEG;
      dbgAccDeg.value = 0;
    })
    .onUpdate((e) => {
      if (!valid.value) return;
      const th = Math.atan2(e.y - c, e.x - c);
      acc.value += wrap(th - last.value);
      last.value = th;
      dbgAngleDeg.value = th * RAD_TO_DEG;
      while (acc.value >= tick) {
        acc.value -= tick;
        dbgSteps.value += 1;
        runOnJS(onStep)(1);
      }
      while (acc.value <= -tick) {
        acc.value += tick;
        dbgSteps.value += 1;
        runOnJS(onStep)(-1);
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
        runOnJS(onTap)('select');
        return;
      }
      const a = (Math.atan2(dy, dx) * 180) / Math.PI;
      const zone: Zone =
        a > -135 && a <= -45
          ? 'menu'
          : a > -45 && a <= 45
            ? 'next'
            : a > 45 && a <= 135
              ? 'play'
              : 'prev';
      runOnJS(onTap)(zone);
    });

  const debug: ClickWheelDebugValues = { angleDeg: dbgAngleDeg, accDeg: dbgAccDeg, steps: dbgSteps };

  // Long-press is only offered when a handler is supplied, so the default
  // behaviour (a plain Menu tap) is untouched.
  if (onMenuLongPress) {
    const longPressMenu = Gesture.LongPress()
      .minDuration(600)
      .maxDistance(8)
      .onStart((e) => {
        const dx = e.x - c;
        const dy = e.y - c;
        const r = Math.hypot(dx, dy);
        if (r > c || r <= inner) return;
        const a = (Math.atan2(dy, dx) * 180) / Math.PI;
        const isMenu = a > -135 && a <= -45;
        if (isMenu) runOnJS(onMenuLongPress)();
      });

    // LongPress must win over Tap when it fires, so it is raced first and the
    // tap is raced after it.
    return { gesture: Gesture.Race(longPressMenu, pan, tap), debug };
  }

  return { gesture: Gesture.Race(pan, tap), debug };
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
