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
 * AppThemeConfig (the reference warm matte #5C5855 -> #464340 -> #35322F by
 * default), so switching theme in Settings > Themes repaints this screen
 * without a relaunch.
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
import Svg, { Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { click } from '../haptics/haptics';
import type { NowPlayingLayout } from '../library/settings';
import { resolveArtworkUri } from '../library/resolveUri';
import { usePlayerStore } from '../player/store';
import { darkenHex, mixHex, radii, type AppThemeConfig } from './theme';

type Props = {
  width: number;
  height: number;
  /** Active app theme: drives the background gradient and the fallback cover. */
  theme: AppThemeConfig;
  /** Settings > Now Playing Style. `split` is the 2-column concept layout. */
  layout?: NowPlayingLayout;
};

/** figPod full-bleed design: status band, full-width art, matte metadata bar. */
const FULL_STATUS_H = 24;
/** Fraction of the LCD height the artwork fills. */
const FULL_ART_RATIO = 0.74;

/** Fixed bands of the screen, in points. */
const STATUS_H = 28;
const FOOTER_H = 24;
/** Horizontal / vertical inset of every band, so they all line up. */
const PAD_H = 18;
const PAD_V = 14;
/** Gap between the artwork block and the scrubber. */
const SCRUB_MT = 14;
/** Artwork corner radius, per the concept (10dp). */
const ART_RADIUS = 10;
/** Artwork edge as a fraction of the padded inner screen width. */
const ART_RATIO = 0.46;
/** How long the volume HUD stays visible after the last change. */
const VOLUME_HUD_MS = 1800;
/** Hard ceiling for a formatted timestamp, so garbage never renders "83:11:47". */
const MAX_TIME_MS = 24 * 60 * 60 * 1000;

/** Ink levels used by the metadata column. */
const TITLE_INK = '#FFFFFF';
const ARTIST_INK = 'rgba(255,255,255,0.8)';
const ALBUM_INK = 'rgba(255,255,255,0.6)';
const COUNTER_INK = 'rgba(255,255,255,0.6)';
const TIME_INK = 'rgba(255,255,255,0.65)';
const ROUTE_INK = 'rgba(255,255,255,0.92)';
const TRACK_INK = 'rgba(255,255,255,0.25)';
const FILL_INK = '#FFFFFF';

/**
 * Coerces a store value into a safe, non-negative, finite duration. Guards the
 * "-83:11:47" bug: a negative, NaN or absurd duration now reads as 0 instead of
 * formatting into hours/days of nonsense.
 */
function safeMs(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Math.floor(value), MAX_TIME_MS);
}

/** Formats milliseconds as m:ss (or h:mm:ss when >= 1h). Never negative. */
function formatTime(ms: number): string {
  const totalSec = Math.floor(safeMs(ms) / 1000);
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

/** Status-bar transport indicator: solid white play triangle or pause bars. */
function TransportIcon() {
  const playing = usePlayerStore((s) => s.playing);

  return (
    <Svg width={16} height={16} viewBox="0 0 16 16">
      {playing ? (
        <>
          <Rect x={2} y={1.5} width={4.2} height={13} rx={1.2} fill={FILL_INK} />
          <Rect x={9.8} y={1.5} width={4.2} height={13} rx={1.2} fill={FILL_INK} />
        </>
      ) : (
        <Path d="M2.6 1.2 L13.6 8 L2.6 14.8 Z" fill={FILL_INK} />
      )}
    </Svg>
  );
}

/**
 * Status-bar battery: 26x13 outline with a solid white fill bar (not cells),
 * and a small terminal nub on the right.
 */
function BatteryIcon({ level = 0.8 }: { level?: number }) {
  const bodyW = 23;
  const bodyH = 12;
  const inset = 2.2;
  const fill = Math.min(1, Math.max(0, level));

  return (
    <Svg width={26} height={13} viewBox="0 0 26 13">
      <Rect
        x={0.5}
        y={0.5}
        width={bodyW - 1}
        height={bodyH - 1}
        rx={3}
        stroke={FILL_INK}
        strokeWidth={1}
        fill="none"
      />
      <Rect x={bodyW} y={bodyH / 2 - 2.5} width={2.5} height={5} rx={1} fill={FILL_INK} />
      <Rect
        x={inset}
        y={inset}
        width={Math.max(0, (bodyW - inset * 2) * fill)}
        height={bodyH - inset * 2}
        rx={1.4}
        fill={FILL_INK}
      />
    </Svg>
  );
}

/** AirPods-style double-earbud glyph for the audio-output footer. */
function EarbudsIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18">
      {/* Left bud */}
      <Ellipse cx={5.4} cy={5} rx={2.5} ry={2.9} fill={color} />
      <Rect x={4.45} y={7} width={1.9} height={6} rx={0.95} fill={color} />
      {/* Right bud */}
      <Ellipse cx={12.6} cy={5} rx={2.5} ry={2.9} fill={color} />
      <Rect x={11.65} y={7} width={1.9} height={6} rx={0.95} fill={color} />
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

  // Duration is the authority: a bad duration collapses the band to 0:00 /
  // -0:00, and the position can never exceed it.
  const duration = safeMs(durationMs);
  const position = duration > 0 ? Math.min(safeMs(positionMs), duration) : 0;

  const progress = duration > 0 ? position / duration : 0;

  return (
    <View style={styles.scrubber} pointerEvents="none">
      <View style={styles.timeRow}>
        <Text style={styles.time}>{formatTime(position)}</Text>
        <Text style={styles.time}>{`-${formatTime(duration - position)}`}</Text>
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

function SplitNowPlaying({ width, height, theme }: Omit<Props, 'layout'>) {
  const queue = usePlayerStore((s) => s.queue);
  const index = usePlayerStore((s) => s.index);
  const current = usePlayerStore((s) => s.current);

  const artworkUri = resolveArtworkUri(current?.artworkPath);

  // 46% of the padded inner screen width: the content row is the only flexible
  // band, so the artwork scales with the LCD instead of wasting a fixed size.
  const innerWidth = Math.max(0, width - PAD_H * 2);
  const artSize = Math.max(72, innerWidth * ART_RATIO);

  // Theme drives the gradient. Presets may define three stops (the default
  // warm matte does); two-stop presets keep a computed middle.
  const stops = theme.screenBgGradient;
  const gradTop = stops[0];
  const gradBottom = stops[stops.length - 1] as string;
  const gradMid =
    stops.length === 3 ? (stops[1] as string) : mixHex(gradTop, gradBottom, 0.5);

  return (
    <View style={[styles.wrap, { width, height }]}>
      {/* Themed vertical background gradient (three stops). */}
      <Svg style={StyleSheet.absoluteFill} width={width} height={height}>
        <Defs>
          <LinearGradient id="npBg" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={gradTop} />
            <Stop offset="0.52" stopColor={gradMid} />
            <Stop offset="1" stopColor={gradBottom} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill="url(#npBg)" />
      </Svg>

      <View style={styles.content}>
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
                <Image
                  source={{ uri: artworkUri }}
                  style={StyleSheet.absoluteFill}
                  resizeMode="cover"
                />
              ) : (
                <FallbackCover size={artSize} accent={theme.accentColor} />
              )}
            </View>
          </View>

          <View style={[styles.meta, { height: artSize }]}>
            {/* Text stack pinned to the top of the artwork. */}
            <View>
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
            </View>

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
            <EarbudsIcon color={ROUTE_INK} />
            <Text style={styles.routeText}>Headphones</Text>
          </View>
        </View>
      </View>

      <VolumeHud />
    </View>
  );
}

/**
 * figPod full-bleed layout (Reference 3): artwork edge-to-edge across the top
 * ~74%, a translucent status band on top of it, and a dark matte metadata bar
 * filling the bottom ~26% with centred title / artist / track counter.
 */
function FullArtNowPlaying({ width, height, theme }: Omit<Props, 'layout'>) {
  const queue = usePlayerStore((s) => s.queue);
  const index = usePlayerStore((s) => s.index);
  const current = usePlayerStore((s) => s.current);

  const artworkUri = resolveArtworkUri(current?.artworkPath);
  const artHeight = Math.round(height * FULL_ART_RATIO);
  const barHeight = Math.max(0, height - artHeight);

  return (
    <View style={{ width, height, backgroundColor: '#141414' }}>
      {/* Full-bleed artwork across the top of the LCD. */}
      <View style={{ width, height: artHeight, overflow: 'hidden' }}>
        {current && artworkUri ? (
          <Image
            source={{ uri: artworkUri }}
            style={{ width, height: artHeight }}
            resizeMode="cover"
          />
        ) : (
          <FallbackCover size={width} accent={theme.accentColor} />
        )}
      </View>

      {/* Top status band, translucent over the artwork. */}
      <View style={[styles.fullStatus, { height: FULL_STATUS_H }]}>
        <Text numberOfLines={1} style={styles.fullStatusTitle}>
          Now playing
        </Text>
        <View style={styles.fullStatusRight}>
          <TransportIcon />
          <BatteryIcon level={1} />
        </View>
      </View>

      {/* Bottom matte metadata bar. */}
      <View style={[styles.fullBar, { top: artHeight, height: barHeight }]}>
        <Svg style={StyleSheet.absoluteFill} width={width} height={barHeight}>
          <Defs>
            <LinearGradient id="npFullBar" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#232323" stopOpacity={0.92} />
              <Stop offset="1" stopColor="#121212" stopOpacity={0.98} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={width} height={barHeight} fill="url(#npFullBar)" />
        </Svg>

        <View style={styles.fullMeta}>
          <Text numberOfLines={1} ellipsizeMode="tail" style={styles.fullTitle}>
            {current?.title ?? 'No track'}
          </Text>
          <Text numberOfLines={1} ellipsizeMode="tail" style={styles.fullArtist}>
            {current?.artist ?? ''}
          </Text>
          <Text numberOfLines={1} style={styles.fullCounter}>
            {queue.length > 0 ? `${index + 1}/${queue.length}` : ''}
          </Text>
        </View>
      </View>

      <VolumeHud />
    </View>
  );
}

/**
 * Dispatches between the two Now Playing designs. Kept hook-free so switching
 * the setting never changes hook order inside either layout.
 */
export function NowPlaying({ layout = 'split', ...rest }: Props) {
  return layout === 'full' ? (
    <FullArtNowPlaying {...rest} />
  ) : (
    <SplitNowPlaying {...rest} />
  );
}

const styles = StyleSheet.create({
  wrap: {
    // Own radius as well as the LCD parent's clip, so the full-bleed gradient
    // cannot paint a square corner even if a platform ignores parent clipping.
    borderRadius: radii.screen,
    overflow: 'hidden',
  },

  // --- figPod full-bleed layout -------------------------------------------
  fullStatus: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(25,25,25,0.75)',
  },
  fullStatusTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  fullStatusRight: {
    position: 'absolute',
    right: 10,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  fullBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    overflow: 'hidden',
  },
  fullMeta: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  fullTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  fullArtist: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    marginTop: 3,
    textAlign: 'center',
  },
  fullCounter: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  /** Inner padding band: 18 dp horizontal, 14 dp vertical. */
  content: {
    flex: 1,
    paddingHorizontal: PAD_H,
    paddingVertical: PAD_V,
  },

  // 1. status bar
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  clock: {
    color: TITLE_INK,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.2,
    fontVariant: ['tabular-nums'],
  },

  // 2. content row
  contentRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
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
    marginLeft: 16,
    // Exact artwork height, so the text stack top-aligns with the cover and
    // the circular More button sits flush with the artwork's bottom edge.
    justifyContent: 'space-between',
  },
  title: {
    color: TITLE_INK,
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 24,
  },
  artist: {
    color: ARTIST_INK,
    fontSize: 16,
    fontWeight: '400',
    marginTop: 4,
  },
  album: {
    color: ALBUM_INK,
    fontSize: 14,
    fontWeight: '400',
    marginTop: 3,
  },
  counter: {
    color: COUNTER_INK,
    fontSize: 13,
    fontWeight: '500',
    marginTop: 6,
    fontVariant: ['tabular-nums'],
  },
  moreSlot: {
    alignSelf: 'flex-end',
  },
  moreButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    backgroundColor: 'transparent',
    borderWidth: 1.8,
    borderColor: TITLE_INK,
  },
  moreButtonPressed: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: TITLE_INK,
  },

  // 3. scrubber
  scrubber: {
    marginTop: SCRUB_MT,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  time: {
    color: TIME_INK,
    fontSize: 14,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  progressTrack: {
    height: 7,
    borderRadius: 3.5,
    backgroundColor: TRACK_INK,
    overflow: 'hidden',
  },
  progressFill: {
    height: 7,
    borderRadius: 3.5,
    backgroundColor: FILL_INK,
  },

  // 4. footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  route: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  routeText: {
    color: ROUTE_INK,
    fontSize: 15,
    fontWeight: '500',
  },

  // volume HUD (transient, floats above the footer)
  volumeHud: {
    position: 'absolute',
    left: PAD_H,
    right: PAD_H,
    bottom: PAD_V + FOOTER_H + 8,
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
