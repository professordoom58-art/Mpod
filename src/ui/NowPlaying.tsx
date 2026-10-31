/**
 * Now Playing screen (figPod reference): full-bleed square artwork above a dark
 * bottom metadata panel.
 *
 * PERFORMANCE CONTRACT — this is the point of the component split:
 *   - <NowPlaying /> subscribes only to queue/index/current/durationMs, so the
 *     artwork and the metadata text never re-render on a time tick;
 *   - <NowPlayingScrubber /> owns the 4 Hz positionMs subscription;
 *   - <VolumeHud /> owns the volume subscription and its own auto-hide timer.
 *
 * Scrub mode: tapping the scrubber bar toggles it. In scrub mode the bar shows
 * the iPod diamond playhead (◆) and the right-hand timestamp becomes the
 * remaining time (-2:45) instead of the total. Tapping again leaves scrub mode.
 *
 * All gradients are react-native-svg. No Platform branching.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { colors, spacing } from './theme';
import { MarqueeText } from './MarqueeText';
import { resolveArtworkUri } from '../library/resolveUri';
import { usePlayerStore } from '../player/store';

type Props = {
  width: number;
  height: number;
};

const ARTWORK_TOP = spacing.titleBarHeight;
const META_HEIGHT = 76;

/** How long the volume HUD stays visible after the last change. */
const VOLUME_HUD_MS = 1800;

/** Formats milliseconds as m:ss (or h:mm:ss when >= 1h). */
function formatTime(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const ss = s < 10 ? `0${s}` : String(s);
  if (h > 0) {
    const mm = m < 10 ? `0${m}` : String(m);
    return `${h}:${mm}:${ss}`;
  }
  return `${m}:${ss}`;
}

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
      <G stroke={colors.npFallbackAccent} strokeWidth={5} strokeLinecap="round" fill="none">
        <Path d="M58 78 V34 L92 27 V70" />
        <Path d="M58 78 a7 7 0 1 1 14 0 a7 7 0 1 1 -14 0" />
        <Path d="M92 70 a7 7 0 1 1 14 0 a7 7 0 1 1 -14 0" />
      </G>
    </Svg>
  );
}

/** Speaker glyph for the volume HUD. */
function SpeakerIcon({ color }: { color: string }) {
  return (
    <Svg width={12} height={11} viewBox="0 0 12 11">
      <Path d="M1 4 H3.2 L6 1.4 V9.6 L3.2 7 H1 Z" fill={color} />
      <Path d="M8 3.4 a3.2 3.2 0 0 1 0 4.2" stroke={color} strokeWidth={1.1} fill="none" />
      <Path d="M9.6 2 a5.2 5.2 0 0 1 0 7" stroke={color} strokeWidth={1.1} fill="none" />
    </Svg>
  );
}

/**
 * The scrubber. Owns the positionMs subscription and the scrub-mode toggle, so
 * a 4 Hz tick re-renders this bar and nothing else.
 */
function NowPlayingScrubber() {
  const positionMs = usePlayerStore((s) => s.positionMs);
  const durationMs = usePlayerStore((s) => s.durationMs);
  const [scrubbing, setScrubbing] = useState(false);

  const progress = durationMs > 0 ? Math.min(1, Math.max(0, positionMs / durationMs)) : 0;
  const elapsed = formatTime(positionMs);
  // In scrub mode show time remaining, iPod-style: "-2:45".
  const right = scrubbing ? `-${formatTime(Math.max(0, durationMs - positionMs))}` : formatTime(durationMs);

  const toggleScrub = useCallback(() => {
    setScrubbing((v) => !v);
  }, []);

  return (
    <Pressable onPress={toggleScrub} style={styles.progressWrap} hitSlop={6}>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />

        {/* iPod diamond playhead, only while scrubbing. */}
        {scrubbing ? (
          <View style={[styles.playhead, { left: `${Math.round(progress * 100)}%` }]}>
            <Text style={styles.playheadGlyph}>{'\u25C6'}</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.times}>
        {elapsed} / {right}
      </Text>
    </Pressable>
  );
}

/**
 * Dynamic volume HUD. Appears over the scrubber whenever the volume changes and
 * auto-hides after VOLUME_HUD_MS. Subscribes to volume itself so the artwork
 * and metadata never re-render for a volume change.
 *
 * The first render is skipped: mounting the screen must not flash the HUD.
 */
function VolumeHud() {
  const volume = usePlayerStore((s) => s.volume);
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }

    setVisible(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setVisible(false);
      timer.current = null;
    }, VOLUME_HUD_MS);

    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, [volume]);

  if (!visible) return null;

  return (
    <View style={styles.volumeHud} pointerEvents="none">
      <SpeakerIcon color={colors.npHeaderText} />
      <View style={styles.volumeTrack}>
        <View style={[styles.volumeFill, { width: `${Math.round(volume * 100)}%` }]} />
      </View>
    </View>
  );
}

export function NowPlaying({ width, height }: Props) {
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
          <Svg width={16} height={9} viewBox="0 0 18 9">
            <Rect
              x={0.5}
              y={0.5}
              width={14}
              height={8}
              rx={2}
              stroke={colors.npHeaderText}
              strokeWidth={1}
              fill="none"
            />
            <Rect x={15.5} y={3} width={2} height={3} rx={1} fill={colors.npHeaderText} />
            <Rect x={2} y={2} width={9} height={5} rx={1} fill={colors.npHeaderText} />
          </Svg>
        </View>
      </View>

      {/* Artwork / fallback */}
      <View style={[styles.art, { width: artWidth, height: artHeight }]}>
        {current && artworkUri ? (
          <Image
            source={{ uri: artworkUri }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
          />
        ) : (
          <FallbackCover size={Math.min(artWidth, artHeight)} />
        )}
      </View>

      {/* Metadata panel */}
      <View style={[styles.meta, { height: META_HEIGHT }]}>
        <MarqueeText
          text={current?.title ?? 'No track'}
          style={styles.title}
          align="center"
          height={19}
        />
        <Text numberOfLines={1} style={styles.artist}>
          {current?.artist ?? ''}
        </Text>

        {/* The only time-driven subtree. */}
        <View style={styles.scrubberSlot}>
          <NowPlayingScrubber />
          <VolumeHud />
        </View>

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
  art: {
    backgroundColor: '#000000',
    alignSelf: 'center',
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
    marginTop: 3,
  },
  scrubberSlot: {
    alignSelf: 'stretch',
    marginTop: 4,
  },
  progressWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    paddingHorizontal: 4,
  },
  progressTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3A3D44',
    justifyContent: 'center',
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#4F9CF9',
  },
  playhead: {
    position: 'absolute',
    top: -5,
    marginLeft: -5,
    width: 10,
    alignItems: 'center',
  },
  playheadGlyph: {
    color: '#FFFFFF',
    fontSize: 10,
    lineHeight: 12,
  },
  times: {
    marginLeft: 6,
    color: colors.npIndexText,
    fontSize: 9,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  /** Floats over the scrubber; never takes layout space. */
  volumeHud: {
    position: 'absolute',
    left: 4,
    right: 4,
    top: -2,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(20,21,24,0.92)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  volumeTrack: {
    flex: 1,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#3A3D44',
    overflow: 'hidden',
    marginLeft: 6,
  },
  volumeFill: {
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#9CA3AF',
  },
});
