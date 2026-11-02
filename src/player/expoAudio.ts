/**
 * Phase 4 expo-audio backend for the PlayerEngine contract.
 *
 * Wraps a single expo-audio AudioPlayer. Track changes call `replace()`,
 * playback state is pushed to subscribers through `playbackStatusUpdate`.
 * This is the only file that imports expo-audio for playback; the UI talks to
 * the PlayerEngine interface and to store.ts.
 *
 * API verified against node_modules/expo-audio@58.0.10/build/*.d.ts:
 *   createAudioPlayer(source, { updateInterval }) -> AudioPlayer
 *   AudioPlayer.play() / pause() / replace(source) / seekTo(seconds)
 *   AudioPlayer.volume (0..1), currentTime (s), duration (s), remove()
 *   event 'playbackStatusUpdate' -> AudioStatus { currentTime, duration,
 *     playing, didJustFinish, isLoaded, error, ... }
 */

import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioMetadata,
  type AudioPlayer,
} from 'expo-audio';

import type { Track } from '../library/types';
import { resolveArtworkUri, resolveTrackUri } from '../library/resolveUri';
import type { PlayerEngine, PlayerStatus, PlayerStatusListener } from './engine';

/**
 * Builds the lock-screen metadata for a track.
 *
 * artworkUrl is resolved through resolveArtworkUri so an imported file's
 * document-relative artwork path becomes an absolute uri. A track with no
 * artwork simply omits the field rather than passing undefined explicitly.
 */
function lockScreenMetadata(track: Track): AudioMetadata {
  const artworkUrl = resolveArtworkUri(track.artworkPath);
  const metadata: AudioMetadata = {
    title: track.title,
    artist: track.artist,
    albumTitle: track.album,
  };
  if (artworkUrl) metadata.artworkUrl = artworkUrl;
  return metadata;
}

/**
 * Configures the shared audio session once (background + silent-mode).
 *
 * interruptionMode is 'doNotMix' (transient exclusive audio focus): a music
 * player pauses other apps' audio and gets the focus back when done. It is
 * also the mode required by setActiveForLockScreen (Phase 6).
 */
export function configureAudioMode(): Promise<void> {
  return setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: 'doNotMix',
  });
}

/** Wraps a raw index into [0, len). */
function wrapIndex(i: number, len: number): number {
  return ((i % len) + len) % len;
}

export class ExpoAudioEngine implements PlayerEngine {
  private player: AudioPlayer | null = null;
  private queue: Track[] = [];
  private index = 0;
  private volume = 1;
  private didJustFinish = false;
  private listeners = new Set<PlayerStatusListener>();
  private disposed = false;
  /**
   * Our last play/pause intent. `player.playing` lags behind native until the
   * next status update, so emitCurrent() reports `wantsPlay || playing` to
   * avoid a brief "paused" flicker right after a track change. Once native
   * emits a status (e.g. an interruption), wantsPlay is overwritten with the
   * authoritative value.
   */
  private wantsPlay = false;

  /** True once the lock screen has been activated for this engine. */
  private lockScreenActive = false;

  /** Lazily created once; kept alive for the app lifetime. */
  private getPlayer(): AudioPlayer {
    if (this.player) return this.player;

    const player = createAudioPlayer(null, { updateInterval: 250 });
    this.player = player;

    player.addListener('playbackStatusUpdate', (status) => {
      this.didJustFinish = status.didJustFinish;
      // Native status is authoritative; it replaces our optimistic intent.
      this.wantsPlay = status.playing;
      this.emit({
        positionMs: Math.round(status.currentTime * 1000),
        durationMs: Math.round(status.duration * 1000),
        playing: status.playing,
        index: this.index,
        didJustFinish: status.didJustFinish,
      });
    });

    // Volume is per-player; re-apply the engine's value to the fresh player.
    player.volume = this.volume;

    return player;
  }

  /**
   * Points the lock screen / media notification at `track`.
   *
   * MUST stay non-fatal. Playback is already running when this is called, and
   * there are two independent failure modes:
   *
   *  - Native binding failures (service absent from the merged manifest, bind
   *    refused, service died) are reported by expo-audio through `jsLogger`
   *    and are never thrown, so they cannot interrupt playback by themselves.
   *    See expo.modules.audio.service.AudioPlaybackServiceConnection /
   *    BaseServiceConnection.
   *  - A Kotlin exception that DOES cross the bridge — AppContextLost from the
   *    service connection, an unreadable/invalid artwork uri, a missing
   *    native module in an old dev client — arrives here as a JS throw. This
   *    method owns that catch so the audio started by startCurrent() keeps
   *    playing through the speakers/headphones.
   *
   * Activate once, then update: `setActiveForLockScreen` re-arms
   * AudioControlsService.setPlayableOptions, which RELEASES and rebuilds the
   * MediaSession when the playable is already current. Calling it per track
   * would tear the notification down and rebuild it on every song, so the
   * lighter `updateLockScreenMetadata` is used from the second track on.
   *
   * Known consequence: if the very first bind fails, `lockScreenActive` is
   * latched true anyway (the native call reports success even when the async
   * bind did not complete), so later tracks only log "service not connected"
   * and do not retry. Audio is unaffected; the flag resets in dispose().
   */
  private updateLockScreen(player: AudioPlayer, track: Track): void {
    try {
      const metadata = lockScreenMetadata(track);
      if (!this.lockScreenActive) {
        player.setActiveForLockScreen(true, metadata);
        this.lockScreenActive = true;
      } else {
        player.updateLockScreenMetadata(metadata);
      }
    } catch (e) {
      // Deliberately not latching on failure: a throw during the first
      // activation leaves lockScreenActive false so the next track retries
      // instead of losing lock-screen controls for the whole session.
      console.error('[player] lock screen update failed (audio unaffected)', e);
    }
  }

  /**
   * Swaps the current source and starts playing. Wrapped in try/catch because
   * a failed source (e.g. an unreadable content:// uri) must never abort a
   * scan or take down the JS thread.
   */
  private startCurrent(): void {
    const track = this.queue[this.index];
    if (!track) return;

    const player = this.getPlayer();
    try {
      player.replace({ uri: resolveTrackUri(track) });
      player.volume = this.volume;
      this.wantsPlay = true;
      // Playback first. Everything after this line is accessory (lock screen,
      // media notification, and on Android the media session that keeps
      // background playback alive past ~3 minutes) and is isolated so it can
      // never prevent or interrupt the audio that is already running.
      player.play();
      this.emitCurrent();
      this.updateLockScreen(player, track);
    } catch (e) {
      console.error('[player] failed to start track', track.id, e);
      this.wantsPlay = false;
      this.emit({
        positionMs: 0,
        durationMs: track.durationMs || 0,
        playing: false,
        index: this.index,
        didJustFinish: false,
      });
    }
  }

  async load(queue: Track[], startIndex: number): Promise<void> {
    this.queue = queue;
    this.index = Math.min(Math.max(startIndex, 0), Math.max(0, queue.length - 1));
    this.didJustFinish = false;
    if (queue.length === 0) return;
    this.startCurrent();
  }

  play(): void {
    this.wantsPlay = true;
    this.getPlayer().play();
  }

  pause(): void {
    this.wantsPlay = false;
    this.getPlayer().pause();
  }

  togglePlay(): void {
    const player = this.getPlayer();
    // Use intent too: player.playing can lag right after play().
    if (player.playing || this.wantsPlay) {
      this.wantsPlay = false;
      player.pause();
    } else {
      this.wantsPlay = true;
      player.play();
    }
  }

  /**
   * Moves to a new queue index and starts it.
   *
   * startCurrent() handles the lock-screen metadata swap (activate on the
   * first track, update on every later one), so nothing extra is needed here.
   */
  private moveTo(i: number): void {
    if (this.queue.length === 0) return;
    this.index = wrapIndex(i, this.queue.length);
    this.didJustFinish = false;
    this.startCurrent();
  }

  next(): void {
    this.moveTo(this.index + 1);
  }

  prev(): void {
    this.moveTo(this.index - 1);
  }

  /** Seeks by milliseconds. seekTo returns a Promise; rejections are logged. */
  seek(ms: number): void {
    if (!this.player) return;
    this.player.seekTo(Math.max(0, ms) / 1000).catch((e) => {
      console.error('[player] seekTo failed', e);
    });
  }

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    if (this.player) this.player.volume = this.volume;
  }

  onStatus(cb: PlayerStatusListener): () => void {
    this.listeners.add(cb);
    // Immediately deliver current state to the new subscriber.
    if (this.player) this.emitCurrent();
    return () => {
      this.listeners.delete(cb);
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.listeners.clear();
    if (this.player) {
      try {
        this.player.pause();
        if (this.lockScreenActive) {
          this.player.clearLockScreenControls();
          this.lockScreenActive = false;
        }
        this.player.remove();
      } catch {
        /* already released */
      }
      this.player = null;
    }
  }

  private emitCurrent(): void {
    this.emit({
      positionMs: this.player ? Math.round(this.player.currentTime * 1000) : 0,
      durationMs: this.player ? Math.round(this.player.duration * 1000) : 0,
      playing: this.player ? this.player.playing || this.wantsPlay : false,
      index: this.index,
      didJustFinish: this.didJustFinish,
    });
  }

  private emit(status: PlayerStatus): void {
    for (const cb of this.listeners) cb(status);
  }
}
