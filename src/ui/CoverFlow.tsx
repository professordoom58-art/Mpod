/**
 * Cover Flow: the classic 3D album carousel.
 *
 * The active album sits flat, centred and full size. Its neighbours are pushed
 * horizontally outwards, rotated 58 degrees into the screen and scaled to 0.84;
 * depth falls off with distance from the centre. Every card also carries a
 * mirrored floor reflection that fades out over its top quarter.
 *
 * LAYOUT CONTRACT (why this file looks the way it does):
 *   - every card is absolutely positioned at `left = (stageWidth - coverSize)/2`
 *     and `top = stageTop`, so a card whose delta is 0 is dead-centre before any
 *     transform is applied;
 *   - the side-card offset is deliberately non-linear: the first neighbour is
 *     pushed out to 0.58 x coverSize, each further neighbour adds 0.22 x;
 *   - `rotateY` is clamped to +/-58deg and `scale` to 0.84, so a fast 8x wheel
 *     jump can never fling a card across the screen;
 *   - the mounted window is sorted back-to-front (largest |index - activeIndex|
 *     first) and every card carries BOTH zIndex and elevation. Android ignores
 *     zIndex on transformed 3D views unless elevation is also set, which is the
 *     bug behind the sliced/overlapping cards in the on-device screenshots.
 *
 * PERFORMANCE / ANIMATION CONTRACT:
 *   - one shared value (`pos`) holds the fractional active index;
 *   - a selection change only starts a 250 ms timing animation on it;
 *   - each card derives its own transform from `pos` inside a worklet, so the
 *     whole carousel slides on the UI thread without a JS re-render;
 *   - only a +/-WINDOW/2 slice around the selection is mounted, so a 20k-album
 *     library never builds 20k views.
 *
 * No Platform branching. All gradients are react-native-svg.
 */

import { memo, useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import type { AlbumOverlay, Row } from '../nav/menuStack';
import { resolveArtworkUri } from '../library/resolveUri';
import { MenuList } from './MenuList';
import { FallbackCover } from './NowPlaying';
import { fonts, spacing, type LcdPalette } from './theme';
import { visibleRowCount } from './windowing';

type Props = {
  width: number;
  height: number;
  items: Row[];
  selectedIndex: number;
  palette: LcdPalette;
  /** True while the album loader is still running. */
  loading?: boolean;
  /** Set while an album card is flipped open into its tracklist card. */
  overlay?: AlbumOverlay;
};

/** Cards rendered on each side of the active album. */
const HALF_WINDOW = 4;
/** Side-card rotation into the screen, in degrees. */
const SIDE_ROTATION = 58;
/** Side-card scale. */
const SIDE_SCALE = 0.84;
/** Perspective distance for the 3D transform. */
const PERSPECTIVE = 800;
/**
 * Horizontal offset of the first neighbour, as a fraction of cover size. The
 * first side card clears the centre card's edge; each further card adds
 * `SIDE_STEP` instead of the same again.
 */
const SIDE_OFFSET = 0.58;
const SIDE_STEP = 0.22;
/** Transition length for a selection change. */
const SLIDE_MS = 250;
/** Cover card flip into the tracklist card. */
const FLIP_MS = 320;
/** Tracklist card header band (album thumb + title/artist). */
const OVERLAY_HEADER_H = 54;
/** Fraction of the artwork height shown as a reflection. */
const REFLECTION_RATIO = 0.28;

const FLOOR_FROM = '#F0F1F4';
const FLOOR_TO = '#FBFBFC';
/** Floor tint used to fade reflections out (matches the floor at that height). */
const FLOOR_FADE = '#F7F8FA';

const TITLE_FONT_SIZE = 18;
const TITLE_LINE_HEIGHT = 22;
const TITLE_BOTTOM = 18;
const TITLE_REFLECTION_BOTTOM = 2;

type CardProps = {
  index: number;
  /** The committed selection, used only for static stacking order. */
  centerIndex: number;
  artworkPath?: string;
  /** Fallback-cover accent, taken from the LCD highlight color. */
  accent: string;
  size: number;
  reflectionHeight: number;
  /** Horizontal placement inside the stage (already centred). */
  left: number;
  /** Vertical placement inside the stage. */
  top: number;
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
  left,
  top,
  pos,
}: CardProps) {
  const animatedStyle = useAnimatedStyle(() => {
    const delta = index - pos.value;
    const abs = Math.abs(delta);

    // Dead centre: exactly flat, full size, no horizontal offset. Kept as an
    // explicit branch so a settled centre card cannot carry a rounding error
    // from the formulas below.
    if (abs < 0.0001) {
      return {
        opacity: 1,
        transform: [
          { perspective: PERSPECTIVE },
          { translateX: 0 },
          { rotateY: '0deg' },
          { scale: 1 },
        ],
      };
    }

    const sign = Math.sign(delta);
    /*
     * Non-linear spread: 0 at the centre, 0.58 x size for the first neighbour
     * (so it clears the centre cover's edge), then 0.22 x size per further
     * card. The sub-1 leg is interpolated rather than using the literal
     * 0.58 + (abs - 1) * 0.22 form: that form jumps from 0 to 0.36 x size the
     * frame a card leaves the centre, which pops mid-slide. Both agree exactly
     * at abs >= 1, i.e. at every resting position.
     */
    const distance =
      abs < 1 ? SIDE_OFFSET * abs : SIDE_OFFSET + (abs - 1) * SIDE_STEP;
    const translateX = sign * size * distance;
    // Right cards (delta > 0) tip to -58deg, left cards to +58deg.
    const rotation = -sign * Math.min(SIDE_ROTATION, abs * SIDE_ROTATION);
    // 1.0 at the centre, easing to 0.84 for the first neighbour and staying
    // there for the rest of the window.
    const scale = Math.max(SIDE_SCALE, 1 - (1 - SIDE_SCALE) * abs);

    return {
      // A fast jump can mount cards on the far side of the carousel; hide the
      // ones outside the visible window instead of letting them streak in.
      opacity: abs > HALF_WINDOW + 0.5 ? 0 : 1,
      transform: [
        { perspective: PERSPECTIVE },
        { translateX },
        { rotateY: `${rotation}deg` },
        { scale },
      ],
    };
  });

  // Depth shading: side covers darken with distance from the centre, capped so
  // the outermost cards stay readable (reference "Glossy Cover Flow").
  const shadeStyle = useAnimatedStyle(() => ({
    opacity: Math.min(0.45, Math.abs(index - pos.value) * 0.12),
  }));

  // Static stacking values. Android needs elevation as well as zIndex for
  // transformed views to sort correctly, and the JSX order (see CoverFlow) is
  // back-to-front as a third guarantee.
  const distance = Math.abs(index - centerIndex);

  return (
    <Animated.View
      style={[
        styles.card,
        {
          left,
          top,
          width: size,
          height: size + reflectionHeight,
          zIndex: 100 - distance,
          elevation: Math.max(2, (10 - distance) * 2),
        },
        animatedStyle,
      ]}
      pointerEvents="none"
    >
      <View style={styles.sleeve}>
        <CoverArt artworkPath={artworkPath} size={size} accent={accent} />
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.sideShade, shadeStyle]}
        />
      </View>

      {/* 1px keyline so white covers do not melt into the white floor. */}
      <View pointerEvents="none" style={[styles.coverEdge, { width: size, height: size }]} />

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

        {/* Fade the reflection out vertically, over the floor tint. The id is
            per card because several of these SVGs are mounted at once. */}
        <Svg
          style={StyleSheet.absoluteFill}
          width={size}
          height={reflectionHeight}
          pointerEvents="none"
        >
          <Defs>
            <LinearGradient id={`reflectionFade-${index}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={FLOOR_FADE} stopOpacity={0.15} />
              <Stop offset="0.55" stopColor={FLOOR_FADE} stopOpacity={0.75} />
              <Stop offset="1" stopColor={FLOOR_FADE} stopOpacity={1} />
            </LinearGradient>
          </Defs>
          <Rect
            x={0}
            y={0}
            width={size}
            height={reflectionHeight}
            fill={`url(#reflectionFade-${index})`}
          />
        </Svg>
      </View>
    </Animated.View>
  );
});

export function CoverFlow({
  width,
  height,
  items,
  selectedIndex,
  palette,
  loading,
  overlay,
}: Props) {
  // Fractional active index: the single source of the carousel animation.
  const pos = useSharedValue(selectedIndex);

  useEffect(() => {
    pos.value = withTiming(selectedIndex, {
      duration: SLIDE_MS,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    });
  }, [selectedIndex, pos]);

  // Flip progress: 0 = carousel, 1 = tracklist card, animated on the UI thread.
  const flip = useSharedValue(0);
  // Kept in state so the card stays mounted while it flips closed.
  const [display, setDisplay] = useState<AlbumOverlay | undefined>(overlay);
  const displayRef = useRef<AlbumOverlay | undefined>(overlay);

  useEffect(() => {
    if (overlay) {
      displayRef.current = overlay;
      setDisplay(overlay);
      if (flip.value < 1) {
        flip.value = withTiming(1, {
          duration: FLIP_MS,
          easing: Easing.inOut(Easing.cubic),
        });
      }
      return;
    }

    if (displayRef.current) {
      flip.value = withTiming(
        0,
        { duration: FLIP_MS, easing: Easing.inOut(Easing.cubic) },
        (finished) => {
          if (finished) {
            displayRef.current = undefined;
            runOnJS(setDisplay)(undefined);
          }
        },
      );
    }
  }, [overlay, flip]);

  // The carousel tips back and dims; the card swings up from 90deg to flat.
  const stageStyle = useAnimatedStyle(() => ({
    opacity: 1 - flip.value,
    transform: [
      { perspective: 1000 },
      { rotateY: `${-flip.value * 90}deg` },
    ],
  }));

  const cardStyle = useAnimatedStyle(() => ({
    opacity: flip.value,
    transform: [
      { perspective: 1000 },
      { rotateY: `${(1 - flip.value) * 90}deg` },
    ],
  }));

  const isEmpty = items.length === 0 || (items.length === 1 && items[0].id === 'empty');
  const active = items[selectedIndex];

  const coverSize = Math.round(Math.min(width * 0.58, height * 0.54));
  const reflectionHeight = Math.round(coverSize * REFLECTION_RATIO);
  const stageTop = Math.round(height * 0.06);
  const cardLeft = (width - coverSize) / 2;

  // Only the cards near the selection are mounted, sorted back-to-front:
  // farthest first, the active album LAST in JSX so it paints on top. Combined
  // with zIndex + elevation this is the Android-safe stacking order.
  const first = Math.max(0, selectedIndex - HALF_WINDOW);
  const last = Math.min(items.length - 1, selectedIndex + HALF_WINDOW);
  const cards: { row: Row; index: number }[] = [];
  for (let i = first; i <= last; i += 1) {
    cards.push({ row: items[i], index: i });
  }
  cards.sort(
    (a, b) => Math.abs(b.index - selectedIndex) - Math.abs(a.index - selectedIndex),
  );

  const activeLabel = active?.label ?? '';

  // Tracklist card geometry: comfortably wider than a cover, centred in stage.
  const overlayWidth = Math.min(width - 28, Math.round(coverSize * 1.7));
  const overlayHeight = Math.min(height - 28, Math.round(coverSize * 1.55));
  const overlayLeft = (width - overlayWidth) / 2;
  const overlayTop = Math.max(6, Math.round((height - overlayHeight) / 2));
  const overlayListHeight = Math.max(
    spacing.lcdRowHeight,
    overlayHeight - OVERLAY_HEADER_H,
  );
  const overlayRows = visibleRowCount(overlayListHeight, spacing.lcdRowHeight);
  const overlayStart = display
    ? Math.max(
        0,
        Math.min(
          display.selectedIndex - Math.floor(overlayRows / 2),
          Math.max(0, display.items.length - overlayRows),
        ),
      )
    : 0;

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
          {/* Carousel + title, rotated back and faded out when the album card
              flips open. */}
          <Animated.View
            style={[styles.stage, { width, height }, stageStyle]}
            pointerEvents="none"
          >
            {cards.map(({ row, index }) => (
              <CoverCard
                key={row.id}
                index={index}
                centerIndex={selectedIndex}
                artworkPath={row.artworkPath}
                accent={palette.highlightBackground}
                size={coverSize}
                reflectionHeight={reflectionHeight}
                pos={pos}
                // Positioning lives here (not in the memoised card) because it
                // changes only with the LCD size.
                left={cardLeft}
                top={stageTop}
              />
            ))}

            {/* Centred active album title over the floor, with its vertically
                flipped 18% reflection directly beneath it. */}
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={[styles.title, { bottom: TITLE_BOTTOM }]}
            >
              {activeLabel}
            </Text>
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={[styles.title, styles.titleReflection, { bottom: TITLE_REFLECTION_BOTTOM }]}
            >
              {activeLabel}
            </Text>
          </Animated.View>

          {/* Flipped-open album tracklist card. */}
          {display ? (
            <Animated.View
              style={[
                styles.overlayCard,
                {
                  width: overlayWidth,
                  height: overlayHeight,
                  left: overlayLeft,
                  top: overlayTop,
                },
                cardStyle,
              ]}
            >
              <View style={[styles.overlayHeader, { height: OVERLAY_HEADER_H }]}>
                <View style={styles.overlayThumb}>
                  <CoverArt
                    artworkPath={display.artworkPath}
                    size={38}
                    accent={palette.highlightBackground}
                  />
                </View>
                <View style={styles.overlayHeaderText}>
                  <Text numberOfLines={1} style={styles.overlayTitle}>
                    {display.title}
                  </Text>
                  <Text numberOfLines={1} style={styles.overlayArtist}>
                    {display.sub ?? ''}
                  </Text>
                </View>
              </View>

              <MenuList
                items={display.items}
                selectedIndex={display.selectedIndex}
                windowStart={overlayStart}
                visibleRows={overlayRows}
                width={overlayWidth}
                height={overlayListHeight}
                palette={palette}
                loading={display.loading}
              />
            </Animated.View>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  card: {
    // Positioned by the `left`/`top` props supplied by CoverFlow; this view is
    // the transform target, so its centre is the transform origin.
    position: 'absolute',
  },
  sleeve: {
    backgroundColor: '#000000',
  },
  sideShade: {
    backgroundColor: '#000000',
  },
  coverEdge: {
    position: 'absolute',
    top: 0,
    left: 0,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.18)',
  },
  title: {
    position: 'absolute',
    left: 0,
    width: '100%',
    textAlign: 'center',
    fontSize: TITLE_FONT_SIZE,
    lineHeight: TITLE_LINE_HEIGHT,
    fontWeight: '700',
    color: '#111111',
    // Android paints transformed siblings oddly, so the title needs its own
    // stacking context above the carousel.
    zIndex: 50,
    elevation: 30,
  },
  titleReflection: {
    transform: [{ scaleY: -1 }],
    opacity: 0.18,
  },
  overlayCard: {
    position: 'absolute',
    backgroundColor: '#F7F8FA',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.18)',
    shadowColor: '#000000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },
  overlayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    backgroundColor: '#EEF0F4',
    borderBottomWidth: 1,
    borderBottomColor: '#D4D8E0',
  },
  overlayThumb: {
    width: 38,
    height: 38,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  overlayHeaderText: {
    flex: 1,
  },
  overlayTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111111',
  },
  overlayArtist: {
    fontSize: 11,
    color: '#5B6270',
    marginTop: 1,
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
