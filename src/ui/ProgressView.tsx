/**
 * Scanning screen. Reads progress straight from the library store so it does
 * not need props threaded through the menu tree.
 */

import { StyleSheet, Text, View } from 'react-native';

import { useLibraryStore } from '../library/store';
import { fonts, spacing, type LcdPalette } from './theme';

type Props = {
  width: number;
  height: number;
  status?: string;
  palette: LcdPalette;
};

const PHASE_LABEL: Record<string, string> = {
  listing: 'Finding music',
  reading: 'Reading tags',
  saving: 'Saving',
  done: 'Done',
  error: 'Error',
};

export function ProgressView({ width, height, status, palette }: Props) {
  const progress = useLibraryStore((s) => s.progress);
  const lastResult = useLibraryStore((s) => s.lastResult);

  const phase = progress?.phase ?? 'listing';
  const done = progress?.done ?? 0;
  const total = progress?.total ?? 0;
  const ratio = total > 0 ? Math.min(1, done / total) : 0;

  const label = PHASE_LABEL[phase] ?? 'Working';
  const failed = lastResult?.failed ?? 0;
  const message = status ?? progress?.message;

  return (
    <View style={[styles.wrap, { width, height }]}>
      <Text style={[styles.phase, { color: palette.text }]}>{label}</Text>

      {total > 0 ? (
        <Text style={[styles.count, { color: palette.textDim }]}>
          {done} / {total}
        </Text>
      ) : null}

      <View style={[styles.track, { backgroundColor: palette.progressTrack }]}>
        <View
          style={[
            styles.fill,
            { width: `${Math.round(ratio * 100)}%`, backgroundColor: palette.progressFill },
          ]}
        />
      </View>

      {failed > 0 ? (
        <Text style={[styles.failed, { color: palette.textDim }]}>{failed} unreadable</Text>
      ) : null}

      {message ? (
        <Text numberOfLines={1} style={[styles.message, { color: palette.textDim }]}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.lcdPaddingH,
    paddingTop: 6,
  },
  phase: {
    fontSize: fonts.lcdRowSize,
    fontWeight: '600',
  },
  count: {
    fontSize: fonts.lcdSmallSize,
    marginTop: 2,
  },
  track: {
    height: 6,
    borderRadius: 3,
    marginTop: 6,
    overflow: 'hidden',
  },
  fill: {
    height: 6,
    borderRadius: 3,
  },
  failed: {
    fontSize: fonts.lcdSmallSize,
    marginTop: 4,
  },
  message: {
    fontSize: fonts.lcdSmallSize,
    marginTop: 4,
  },
});
