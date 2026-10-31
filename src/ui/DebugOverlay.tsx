/**
 * Debug overlay: shows the live wheel angle, the accumulator, and the total
 * step count.
 *
 * angle/acc/steps live on the UI thread. useAnimatedReaction watches them and
 * pushes a snapshot to JS, gated by a timestamp shared value so we update at
 * most once per flushMs instead of re-rendering at 60fps.
 *
 * The last tapped zone and last step direction used to be props, which forced
 * Body to hold useState for them and re-render on every wheel step. They are
 * gone: the overlay now reports only what it can read from shared values, so
 * nothing above it needs to re-render to feed it.
 */

import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  runOnJS,
  useAnimatedReaction,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { colors, fonts, spacing } from '../ui/theme';

type Props = {
  angleDeg: SharedValue<number>;
  accDeg: SharedValue<number>;
  steps: SharedValue<number>;
  flushMs: number;
};

type Snapshot = { angle: number; acc: number; steps: number };

export function DebugOverlay({ angleDeg, accDeg, steps, flushMs }: Props) {
  const [snap, setSnap] = useState<Snapshot>({ angle: 0, acc: 0, steps: 0 });
  const lastPush = useSharedValue(0);

  const commit = useCallback((next: Snapshot) => {
    setSnap(next);
  }, []);

  useAnimatedReaction(
    () => ({ angle: angleDeg.value, acc: accDeg.value, steps: steps.value }),
    (cur) => {
      const now = Date.now();
      if (now - lastPush.value < flushMs) return;
      lastPush.value = now;
      runOnJS(commit)(cur);
    },
    [flushMs, commit],
  );

  return (
    <View style={styles.wrap} pointerEvents="none">
      <Text style={styles.line}>
        angle {snap.angle.toFixed(1)}deg   acc {snap.acc.toFixed(1)}deg
      </Text>
      <Text style={styles.line}>steps {snap.steps}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.debugBackground,
    borderRadius: 4,
    paddingHorizontal: spacing.lcdPaddingH,
    paddingVertical: 3,
    marginTop: 6,
    alignSelf: 'stretch',
  },
  line: {
    color: colors.debugText,
    fontSize: fonts.debugSize,
    fontVariant: ['tabular-nums'],
  },
});
