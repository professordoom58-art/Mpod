/**
 * Now Playing — "modern iPod" concept layout.
 *
 * Vertical hierarchy (top to bottom):
 *   1. status bar      — clock on the left, transport state + battery right
 *   2. content row     — square artwork left, metadata stack right
 *   3. scrubber        — elapsed/remaining above a full-width pill bar
 *   4. footer          — audio-output route bottom-left, nothing bottom-right
 *
 * The whole background is a vertical gradient taken from the active
 * AppThemeConfig (warm matte #5A5652 -> #383532 by default), so switching
 * theme in Settings > Themes repaints this screen without a relaunch.
 *
 * PERFORMANCE CONTRACT (unchanged from the previous implementation):
 *   - <NowPlaying /> subscribes only to queue/index/current, so the artwork
 *     and the metadata text never re-render on a time tick;
 *   - <NowPlayingScrubber /> owns the 4 Hz positionMs subscription;
 *   - <NowPlayingStatus /> owns the `playing` subscription;
 *   - <Clock /> owns its own minute timer;
 *   - <VolumeHud /> owns the volume subscription and its auto-hide timer.
 *
 * All gradients are react-native-svg. No Platform branching.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { click } from '../haptics/haptics';
import { resolveArtworkUri } from '../library/resolveUri';
import { usePlayerStore } from '../player/store';
import { darkenHex, type AppThemeConfig } from './theme';

type Props = {
  width: number;
  height: number;
  /** Active app theme: drives the background gradient and the fallback cover. */
  theme: AppThemeConfig;
};

/** Fixed bands of the screen, in points. */
const STATUS_H = 22;
const FOOTER_H = 22;
/** Timestamps row + gap + 6 pt bar. */
const SCRUB_H = 34;
/** Horizontal padding for every band, so they all line up. */
const PAD = 12;
/** Artwork corner radius, per the concept (10dp). */
const ART_RADIUS = 10;
/** How long the volume HUD stays visible after the last change. */
const VOLUME_HUD_MS = 1800;

/** Ink levels used by the metadata column. */
const TITLE_INK = '#FFFFFF';
const ARTIST_INK = 'rgba(255,255,255,0.78)';
const ALBUM_INK = 'rgba(255,255,255,0.60)';
const COUNTER_INK = 'rgba(255,255,255,0.60)';
const CHROME_INK = 'rgba(255,255,255,0.82)';
const TRACK_INK = 'rgba(255,255,255,0.25)';
const FILL_INK = '#FFFFFF';

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

/** "9:41 AM" — local device time, the concept's status-bar format. */
function clockLabel(d: Date): string {
  let h = d.getHours();
  const suffix = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  const m = d.getMinutes();
  return `${h}:${m < 10 ? `0${m}` : m} ${suffix}`;
}

/**
 * Status-bar clock. Isolated so a minute tick re-renders one Text, never the
 * artwork or the metadata.
 */
function Clock() {
  const [label, setLabel] = useState(() => clockLabel(new Date()));

  useEffect(() => {
    const id = setInterval(() => {
      const next = clockLabel(new Date());
      setLabel((prev) => (prev === next ? prev : next));
    }, 15000);
    return () => clearInterval(id);
  }, []);

  return <Text style={styles.clock}>{label}</Text>;
}

/** Status-bar transport indicator: play triangle or pause bars. */
function TransportIcon() {
  const playing = usePlayerStore((s) => s.playing);

  return (
    <Svg width={9} height={10} viewBox="0 0 9 10">
      {playing ? (
        <>
          <Rect x={0} y={0} width={2.8} height={10} rx={0.9} fill={CHROME_INK} />
          <Rect x={6.2} y={0} width={2.8} height={10} rx={0.9} fill={CHROME_INK} />
        </>
      ) : (
        <Path d="M0.6 0.5 L8.4 5 L0.6 9.5 Z" fill={CHROME_INK} />
      )}
    </Svg>
  );
}

/** Status-bar battery: outline, terminal nub and a 4-cell fill. */
function BatteryIcon({ level = 0.8 }: { level?: number }) {
  const bodyW = 18;
  const bodyH = 9;
  const cells = 4;
  const gap = 1;
  const inset = 1.5;
  const cellW = (bodyW - inset * 2 - gap * (cells - 1)) / cells;
  const filled = Math.round(Math.min(1, Math.max(0, level)) * cells);

  return (
    <Svg width={bodyW + 3} height={bodyH} viewBox={`0 0 ${bodyW + 3} ${bodyH}`}>
      <Rect
        x={0.5}
        y={0.5}
        width={bodyW - 1}
        height={bodyH - 1}
        rx={2}
        stroke={CHROME_INK}
        strokeWidth={1}
        fill="none"
      />
      <Rect x={bodyW} y={bodyH / 2 - 2} width={2} height={4} rx={0.8} fill={CHROME_INK} />
      {Array.from({ length: cells }).map((_, i) => (
        <Rect
          key={i}
          x={inset + i * (cellW + gap)}
          y={inset}
          width={cellW}
          height={bodyH - inset * 2}
          rx={0.6}
          fill={i < filled ? CHROME_INK : 'rgba(255,255,255,0.22)'}
        />
      ))}
    </Svg>
  );
}

/** Headphone glyph for the audio-output footer. */
function HeadphonesIcon({ color }: { color: string }) {
  return (
    <Svg width={11} height={11} viewBox="0 0 12 12">
      <Path
        d="M1.4 8.2 V6.4 a4.6 4.6 0 0 1 9.2 0 V8.2"
        stroke={color}
        strokeWidth={1.2}
        fill="none"
        strokeLinecap="round"
      />
      <Rect x={0.6} y={7.4} width={2.2} height={3.4} rx={1} fill={color} />
      <Rect x={9.2} y={7.4} width={2.2} height={3.4} rx={1} fill={color} />
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

/** Circular `•••` (More) button. No star/favourite icon by design. */
function MoreButton() {
  const onPress = useCallback(() => {
    // Haptic acknowledgement only: the options sheet is Phase 5 work and there
    // is no track-options frame in the menu tree yet.
    click();
  }, []);

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="More options"
      style={({ pressed }) => [styles.moreButton, pressed ? styles.moreButtonPressed : null]}
    >
      <View style={styles.dot} />
      <View style={styles.dot} />
      <View style={styles.dot} />
    </Pressable>
  );
}

/** A stylized retro cover: diagonal gradient + a musical note. */
export function FallbackCover({ size, accent }: { size: number; accent: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Defs>
        <LinearGradient id="cover" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={accent} />
          <Stop offset="1" stopColor={darkenHex(accent, 0.72)} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="120" height="120" fill="url(#cover)" />
      <G stroke={TITLE_INK} strokeWidth={5} strokeLinecap="round" fill="none">
        <Path d="M58 78 V34 L92 27 V70" />
        <Path d="M58 78 a7 7 0 1 1 14 0 a7 7 0 1 1 -14 0" />
        <Path d="M92 70 a7 7 0 1 1 14 0 a7 7 0 1 1 -14 0" />
      </G>
    </Svg>
  );
}

/**
 * The scrubber: timestamps row ABOVE a full-width pill track with a solid
 * white fill and no thumb knob. Owns the positionMs subscription, so the
 * 4 Hz tick re-renders this band and nothing else.
 */
function NowPlayingScrubber() {
  const positionMs = usePlayerStore((s) => s.positionMs);
  const durationMs = usePlayerStore((s) => s.durationMs);

  const progress = durationMs > 0 ? Math.min(1, Math.max(0, positionMs / durationMs)) : 0;
  const elapsed = formatTime(positionMs);
  const remaining = formatTime(Math.max(0, durationMs - positionMs));

  return (
    <View style={styles.scrubber} pointerEvents="none">
      <View style={styles.timeRow}>
        <Text style={styles.time}>{elapsed}</Text>
        <Text style={styles.time}>{`-${remaining}`}</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
      </View>
    </View>
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
      <SpeakerIcon color={TITLE_INK} />
      <View style={styles.volumeTrack}>
        <View style={[styles.volumeFill, { width: `${Math.round(volume * 100)}%` }]} />
      </View>
    </View>
  );
}

export function NowPlaying({ width, height, theme }: Props) {
  const queue = usePlayerStore((s) => s.queue);
  const index = usePlayerStore((s) => s.index);
  const current = usePlayerStore((s) => s.current);

  const artworkUri = resolveArtworkUri(current?.artworkPath);

  // The artwork is square and fills the content band as far as the width allows.
  const contentH = Math.max(0, height - STATUS_H - SCRUB_H - FOOTER_H - 8);
  const artSize = Math.max(56, Math.min(width * 0.46, contentH));

  return (
    <View style={[styles.wrap, { width, height }]}>
      {/* Themed vertical background gradient. */}
      <Svg style={StyleSheet.absoluteFill} width={width} height={height}>
        <Defs>
          <LinearGradient id="npBg" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={theme.screenBgGradient[0]} />
            <Stop offset="1" stopColor={theme.screenBgGradient[1]} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill="url(#npBg)" />
      </Svg>

      {/* 1. Status bar: clock left, transport + battery right. */}
      <View style={[styles.statusBar, { height: STATUS_H }]}>
        <Clock />
        <View style={styles.statusRight}>
          <TransportIcon />
          <BatteryIcon />
        </View>
      </View>

      {/* 2. Content row: square artwork + metadata stack. */}
      <View style={styles.contentRow}>
        <View style={[styles.artShadow, { width: artSize, height: artSize }]}>
          <View style={styles.artClip}>
            {current && artworkUri ? (
              <Image source={{ uri: artworkUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            ) : (
              <FallbackCover size={artSize} accent={theme.accentColor} />
            )}
          </View>
        </View>

        <View style={[styles.meta, { height: artSize }]}>
          {/* Single-line title, tail ellipsis, per the concept. */}
          <Text numberOfLines={1} ellipsizeMode="tail" style={styles.title}>
            {current?.title ?? 'No track'}
          </Text>

          <Text numberOfLines={1} ellipsizeMode="tail" style={styles.artist}>
            {current?.artist ?? ''}
          </Text>
          <Text numberOfLines={1} ellipsizeMode="tail" style={styles.album}>
            {current?.album ?? ''}
          </Text>
          <Text numberOfLines={1} style={styles.counter}>
            {queue.length > 0 ? `${index + 1} of ${queue.length}` : ''}
          </Text>

          <View style={styles.metaSpacer} />
          <View style={styles.moreSlot}>
            <MoreButton />
          </View>
        </View>
      </View>

      {/* 3. Scrubber: timestamps above the bar. */}
      <NowPlayingScrubber />

      {/* 4. Footer: audio route left, deliberately empty right. */}
      <View style={[styles.footer, { height: FOOTER_H }]}>
        <View style={styles.route}>
          <HeadphonesIcon color={CHROME_INK} />
          <Text style={styles.routeText}>Headphones</Text>
        </View>
      </View>

      <VolumeHud />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
  },

  // 1. status bar
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: PAD,
  },
  statusRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  clock: {
    color: TITLE_INK,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
    fontVariant: ['tabular-nums'],
  },

  // 2. content row
  contentRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: PAD,
  },
  artShadow: {
    borderRadius: ART_RADIUS,
    backgroundColor: 'rgba(0,0,0,0.35)',
    shadowColor: '#000000',
    shadowOpacity: 0.38,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 7,
  },
  artClip: {
    flex: 1,
    borderRadius: ART_RADIUS,
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  meta: {
    flex: 1,
    marginLeft: PAD,
    justifyContent: 'flex-start',
  },
  title: {
    color: TITLE_INK,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 22,
  },
  artist: {
    color: ARTIST_INK,
    fontSize: 14,
    fontWeight: '500',
    marginTop: 2,
  },
  album: {
    color: ALBUM_INK,
    fontSize: 13,
    fontWeight: '400',
    marginTop: 1,
  },
  counter: {
    color: COUNTER_INK,
    fontSize: 12,
    fontWeight: '500',
    marginTop: 6,
    fontVariant: ['tabular-nums'],
  },
  metaSpacer: {
    flex: 1,
  },
  moreSlot: {
    alignSelf: 'flex-end',
  },
  moreButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  moreButtonPressed: {
    backgroundColor: 'rgba(255,255,255,0.26)',
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: TITLE_INK,
  },

  // 3. scrubber
  scrubber: {
    paddingHorizontal: PAD,
    paddingTop: 2,
    paddingBottom: 6,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  time: {
    color: COUNTER_INK,
    fontSize: 11,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: TRACK_INK,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: FILL_INK,
  },

  // 4. footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: PAD,
  },
  route: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  routeText: {
    color: COUNTER_INK,
    fontSize: 11,
    fontWeight: '500',
  },

  // volume HUD (transient, floats above the footer)
  volumeHud: {
    position: 'absolute',
    left: PAD,
    right: PAD,
    bottom: FOOTER_H + 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(20,21,24,0.92)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  volumeTrack: {
    flex: 1,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
    marginLeft: 6,
  },
  volumeFill: {
    height: 3,
    borderRadius: 1.5,
    backgroundColor: TITLE_INK,
  },
});
