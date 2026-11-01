/**
 * Cover Flow: the classic 3D album carousel.
 *
 * The active album sits flat, centred and full size. Its neighbours are pushed
 * away horizontally, rotated 55 degrees into the screen and scaled down; depth
 * falls off with distance from the centre. Every card also carries a mirrored
 * floor reflection that fades out over its top quarter.
 *
 * PERFORMANCE / ANIMATION CONTRACT:
 *   - one shared value (`pos`) holds the fractional active index;
 *   - a selection change only starts a 250 ms timing animation on it;
 *   - each card derives its own transform from `pos` inside a worklet, so the
 *     whole carousel slides on the UI thread without a JS re-render;
 *   - only a ±WINDOW/2 slice around the selection is mounted, so a 20k-album
 *     library never builds 20k views.
 *
 * No Platform branching. All gradients are react-native-svg.
 */

import { memo, useEffect } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import type { Row } from '../nav/menuStack';
import { resolveArtworkUri } from '../library/resolveUri';
import { FallbackCover } from './NowPlaying';
import { fonts, type LcdPalette } from './theme';

type Props = {
  width: number;
  height: number;
  items: Row[];
  selectedIndex: number;
  palette: LcdPalette;
  /** True while the album loader is still running. */
  loading?: boolean;
};

/** Cards rendered on each side of the active album. */
const HALF_WINDOW = 4;
/** Side-card rotation into the screen, in degrees. */
const SIDE_ROTATION = 55;
/** Side-card scale. */
const SIDE_SCALE = 0.82;
/** Horizontal overlap between adjacent cards, as a fraction of cover size. */
const SIDE_SPREAD = 0.34;
/** Transition length for a selection change. */
const SLIDE_MS = 250;
/** Fraction of the artwork height shown as a reflection. */
const REFLECTION_RATIO = 0.25;
/** Perspective distance for the 3D transform. */
const PERSPECTIVE = 900;

const FLOOR_FROM = '#F0F1F4';
const FLOOR_TO = '#FBFBFC';
/** Floor tint used to fade reflections out (matches the floor at that height). */
const FLOOR_FADE = '#F7F8FA';

const TITLE_FONT_SIZE = 16;
const TITLE_LINE_HEIGHT = 21;

type CardProps = {
  index: number;
  /** The committed selection, used only for stacking order. */
  centerIndex: number;
  artworkPath?: string;
  /** Fallback-cover accent, taken from the LCD highlight color. */
  accent: string;
  size: number;
  reflectionHeight: number;
  spread: number;
  /** Fractional active index, animated on the UI thread. */
  pos: SharedValue<number>;
};

/** Square artwork, or the retro fallback when an album has no embedded art. */
function CoverArt({ artworkPath, size, accent }: { artworkPath?: string; size: number; accent: string }) {
  const uri = resolveArtworkUri(artworkPath);
  if (!uri) return <FallbackCover size={size} accent={accent} />;
  return (
    <Image
      source={{ uri }}
      style={{ width: size, height: size }}
      resizeMode="cover"
    />
  );
}

/**
 * One album card: artwork, its floor reflection and the 3D transform.
 * Memoised because a selection change re-renders the window, not the artwork.
 */
const CoverCard = memo(function CoverCard({
  index,
  centerIndex,
  artworkPath,
  accent,
  size,
  reflectionHeight,
  spread,
  pos,
}: CardProps) {
  const animatedStyle = useAnimatedStyle(() => {
    const d = index - pos.value;
    const ad = Math.abs(d);

    // Clamped so a fast 8x jump never flings a card across the screen.
    const clamped = Math.max(-4, Math.min(4, d));
    // Left cards use +55deg, right cards -55deg (positive rotateY pushes the
    // card's right edge away from the viewer).
    const rotation = Math.max(
      -SIDE_ROTATION,
      Math.min(SIDE_ROTATION, -clamped * SIDE_ROTATION),
    );
    const scale =
      ad <= 1
        ? 1 - (1 - SIDE_SCALE) * ad
        : Math.max(0.55, SIDE_SCALE - (ad - 1) * 0.07);

    return {
      opacity: ad > HALF_WINDOW + 0.5 ? 0 : 1,
      transform: [
        { perspective: PERSPECTIVE },
        { translateX: clamped * spread },
        { rotateY: `${rotation}deg` },
        { scale },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        styles.card,
        {
          width: size,
          // zIndex is static: the centred card is always on top, then its
          // immediate neighbours, then the rest.
          zIndex: 100 - Math.abs(index - centerIndex),
        },
        animatedStyle,
      ]}
      pointerEvents="none"
    >
      <View style={styles.sleeve}>
        <CoverArt artworkPath={artworkPath} size={size} accent={accent} />
      </View>

      {/* Mirrored floor reflection, clipped to its top quarter. */}
      <View style={{ width: size, height: reflectionHeight, overflow: 'hidden' }}>
        <View
          style={{
            width: size,
            height: size,
            transform: [{ scaleY: -1 }],
            opacity: 0.7,
          }}
        >
          <CoverArt artworkPath={artworkPath} size={size} accent={accent} />
        </View>

        {/* Fade the reflection out vertically, over the floor tint. */}
        <Svg
          style={StyleSheet.absoluteFill}
          width={size}
          height={reflectionHeight}
          pointerEvents="none"
        >
          <Defs>
            <LinearGradient id="reflectionFade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={FLOOR_FADE} stopOpacity={0.15} />
              <Stop offset="0.55" stopColor={FLOOR_FADE} stopOpacity={0.75} />
              <Stop offset="1" stopColor={FLOOR_FADE} stopOpacity={1} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={size} height={reflectionHeight} fill="url(#reflectionFade)" />
        </Svg>
      </View>
    </Animated.View>
  );
});

export function CoverFlow({ width, height, items, selectedIndex, palette, loading }: Props) {
  // Fractional active index: the single source of the carousel animation.
  const pos = useSharedValue(selectedIndex);

  useEffect(() => {
    pos.value = withTiming(selectedIndex, {
      duration: SLIDE_MS,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    });
  }, [selectedIndex, pos]);

  const isEmpty = items.length === 0 || (items.length === 1 && items[0].id === 'empty');
  const active = items[selectedIndex];

  const coverSize = Math.round(Math.min(width * 0.54, height * 0.5));
  const reflectionHeight = Math.round(coverSize * REFLECTION_RATIO);
  const coverTop = Math.round(height * 0.12);
  const spread = Math.round(coverSize * SIDE_SPREAD);
  const titleTop = coverTop + coverSize + reflectionHeight + Math.round(height * 0.03);

  // Only the cards near the selection are mounted.
  const first = Math.max(0, selectedIndex - HALF_WINDOW);
  const last = Math.min(items.length - 1, selectedIndex + HALF_WINDOW);
  const cards: { row: Row; index: number }[] = [];
  for (let i = first; i <= last; i += 1) {
    cards.push({ row: items[i], index: i });
  }

  return (
    <View style={{ width, height, backgroundColor: FLOOR_TO }}>
      {/* Light floor gradient behind everything. */}
      <Svg style={StyleSheet.absoluteFill} width={width} height={height} pointerEvents="none">
        <Defs>
          <LinearGradient id="coverFlowFloor" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={FLOOR_FROM} />
            <Stop offset="1" stopColor={FLOOR_TO} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill="url(#coverFlowFloor)" />
      </Svg>

      {isEmpty ? (
        <View style={[styles.empty, { height }]}>
          <Text style={[styles.emptyTitle, { color: palette.text }]}>
            {loading ? 'Loading...' : active?.label ?? 'No albums'}
          </Text>
          {active?.sub ? (
            <Text style={[styles.emptySub, { color: palette.textDim }]}>{active.sub}</Text>
          ) : null}
        </View>
      ) : (
        <>
          {/* Carousel: absolute so the cards can overlap without affecting flow. */}
          <View style={[styles.stage, { top: coverTop, width, height: coverSize + reflectionHeight }]}>
            {cards.map(({ row, index }) => (
              <View
                key={row.id}
                style={[styles.slot, { left: (width - coverSize) / 2 }]}
              >
                <CoverCard
                  index={index}
                  centerIndex={selectedIndex}
                  artworkPath={row.artworkPath}
                  accent={palette.highlightBackground}
                  size={coverSize}
                  reflectionHeight={reflectionHeight}
                  spread={spread}
                  pos={pos}
                />
              </View>
            ))}
          </View>

          {/* Active album title + its weak mirrored reflection. */}
          <View style={[styles.titleBlock, { top: titleTop, width }]} pointerEvents="none">
            <Text numberOfLines={1} ellipsizeMode="tail" style={styles.title}>
              {active?.label ?? ''}
            </Text>

            <View style={{ width, height: Math.round(TITLE_LINE_HEIGHT * 0.6), overflow: 'hidden' }}>
              <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                style={[styles.title, styles.titleReflection]}
              >
                {active?.label ?? ''}
              </Text>
              <Svg
                style={StyleSheet.absoluteFill}
                width={width}
                height={Math.round(TITLE_LINE_HEIGHT * 0.6)}
                pointerEvents="none"
              >
                <Defs>
                  <LinearGradient id="titleFade" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={FLOOR_FADE} stopOpacity={0} />
                    <Stop offset="1" stopColor={FLOOR_FADE} stopOpacity={0.95} />
                  </LinearGradient>
                </Defs>
                <Rect
                  x={0}
                  y={0}
                  width={width}
                  height={Math.round(TITLE_LINE_HEIGHT * 0.6)}
                  fill="url(#titleFade)"
                />
              </Svg>
            </View>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    position: 'absolute',
    left: 0,
  },
  slot: {
    position: 'absolute',
    top: 0,
  },
  card: {
    // Cards are absolutely positioned by the slot; stacking comes from zIndex.
    position: 'absolute',
    top: 0,
  },
  sleeve: {
    backgroundColor: '#000000',
  },
  titleBlock: {
    position: 'absolute',
    left: 0,
    alignItems: 'center',
  },
  title: {
    width: '100%',
    textAlign: 'center',
    fontSize: TITLE_FONT_SIZE,
    lineHeight: TITLE_LINE_HEIGHT,
    fontWeight: '700',
    color: '#0A0A0C',
  },
  titleReflection: {
    position: 'absolute',
    top: 0,
    transform: [{ scaleY: -1 }],
    opacity: 0.15,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  emptyTitle: {
    fontSize: fonts.lcdRowSize,
    fontWeight: '600',
  },
  emptySub: {
    fontSize: fonts.lcdSmallSize,
    marginTop: 2,
  },
});
