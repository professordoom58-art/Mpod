/**
 * Now Playing screen (figPod reference). Owns its dark header, the artwork
 * area, and the bottom metadata panel. Reads live state straight from the
 * player store so Next/Prev/Play update it without any nav work.
 */

import { StyleSheet, Text, View, Image } from 'react-native';
import Svg, { Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { colors, spacing } from './theme';
import { resolveArtworkUri } from '../library/resolveUri';
import { usePlayerStore } from '../player/store';

type Props = {
  width: number;
  height: number;
  playing: boolean;
};

const ARTWORK_TOP = spacing.titleBarHeight;
const META_HEIGHT = 68;

/** A stylized retro cover: diagonal gradient + a musical note. */
function FallbackCover({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Defs>
        <LinearGradient id="cover" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={colors.npFallbackFrom} />
          <Stop offset="1" stopColor={colors.npFallbackTo} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="120" height="120" fill="url(#cover)" />
      {/* Musical note: beam + stem + notehead + flag stem. */}
      <G stroke={colors.npFallbackAccent} strokeWidth={5} strokeLinecap="round" fill="none">
        <Path d="M58 78 V34 L92 27 V70" />
        <Path d="M58 78 a7 7 0 1 1 14 0 a7 7 0 1 1 -14 0" />
        <Path d="M92 70 a7 7 0 1 1 14 0 a7 7 0 1 1 -14 0" />
      </G>
    </Svg>
  );
}

export function NowPlaying({ width, height, playing }: Props) {
  const queue = usePlayerStore((s) => s.queue);
  const index = usePlayerStore((s) => s.index);
  const current = usePlayerStore((s) => s.current);

  const artworkUri = resolveArtworkUri(current?.artworkPath);
  const artWidth = width - 8;
  const artHeight = Math.max(0, height - ARTWORK_TOP - META_HEIGHT);

  return (
    <View style={[styles.wrap, { width, height, backgroundColor: colors.npHeader }]}>
      {/* Header */}
      <View style={[styles.header, { height: ARTWORK_TOP }]}>
        <View style={styles.headerSide} />
        <Text numberOfLines={1} style={styles.headerTitle}>
          Now playing
        </Text>
        <View style={[styles.headerSide, styles.headerRight]}>
          <Text style={styles.playState}>{playing ? '\u25B6' : '\u2759\u2759'}</Text>
          <Svg width={16} height={9} viewBox="0 0 18 9">
            <Rect x={0.5} y={0.5} width={14} height={8} rx={2} stroke={colors.npHeaderText} strokeWidth={1} fill="none" />
            <Rect x={15.5} y={3} width={2} height={3} rx={1} fill={colors.npHeaderText} />
            <Rect x={2} y={2} width={9} height={5} rx={1} fill={colors.npHeaderText} />
          </Svg>
        </View>
      </View>

      {/* Artwork / fallback */}
      <View style={[styles.art, { width: artWidth, height: artHeight }]}>
        {current ? (
          artworkUri ? (
            <Image
              source={{ uri: artworkUri }}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
            />
          ) : (
            <FallbackCover size={Math.min(artWidth, artHeight)} />
          )
        ) : (
          <FallbackCover size={Math.min(artWidth, artHeight)} />
        )}
      </View>

      {/* Metadata */}
      <View style={[styles.meta, { height: META_HEIGHT }]}>
        <Text numberOfLines={1} style={styles.title}>
          {current?.title ?? 'No track'}
        </Text>
        <Text numberOfLines={1} style={styles.artist}>
          {current?.artist ?? ''}
        </Text>
        <Text style={styles.index}>
          {queue.length > 0 ? `${index + 1}/${queue.length}` : ''}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lcdPaddingH,
  },
  headerSide: {
    width: 72,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: colors.npHeaderText,
    fontSize: 12,
    fontWeight: '600',
  },
  playState: {
    color: colors.npHeaderText,
    fontSize: 10,
    marginRight: 4,
  },
  art: {
    backgroundColor: '#000000',
  },
  meta: {
    backgroundColor: colors.npMetaBg,
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: spacing.lcdPaddingH,
    justifyContent: 'center',
  },
  title: {
    color: colors.npTitleText,
    fontSize: 14,
    fontWeight: '700',
  },
  artist: {
    color: colors.npArtistText,
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  index: {
    color: colors.npIndexText,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
});
