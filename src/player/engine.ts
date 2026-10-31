/**
 * Player engine contract (Phase 4).
 *
 * The UI and nav layer talk to a `PlayerEngine`, never to expo-audio directly.
 * This interface is the stable seam: `store.ts` configures one instance and
 * subscribes to its status, and the menu tree / click wheel drive playback
 * through the store's public methods.
 *
 * All times are in milliseconds unless the method says otherwise.
 */

import type { Track } from '../library/types';

export type PlayerStatus = {
  /** Playback position in milliseconds. */
  positionMs: number;
  /** Duration of the current track in milliseconds, 0 until known. */
  durationMs: number;
  /** Whether audio is currently playing. */
  playing: boolean;
  /** Index of the current track within the loaded queue. */
  index: number;
  /** True once the current track finished (used to auto-advance). */
  didJustFinish: boolean;
};

export type PlayerStatusListener = (status: PlayerStatus) => void;

export interface PlayerEngine {
  /** Sets the queue and starts playing the track at startIndex. */
  load(queue: Track[], startIndex: number): Promise<void>;
  play(): void;
  pause(): void;
  /** Advances to the next track (wrapping), keeps playing state. */
  next(): void;
  /** Goes to the previous track (wrapping), keeps playing state. */
  prev(): void;
  /** Toggles play/pause. */
  togglePlay(): void;
  /** Seeks the current track to a position in milliseconds. */
  seek(ms: number): void;
  /** Sets volume, 0.0..1.0. */
  setVolume(v: number): void;
  /**
   * Subscribes to status updates. Returns an unsubscribe function.
   * Fired on state changes and periodically while playing.
   */
  onStatus(cb: PlayerStatusListener): () => void;
  /** Releases native resources. Safe to call multiple times. */
  dispose(): void;
}
