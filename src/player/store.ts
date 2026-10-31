/**
 * Playback store. Phase 4: backed by the expo-audio engine (ExpoAudioEngine)
 * behind the stable PlayerEngine contract. The public action signatures
 * (requestPlay, togglePlay, next, prev) are unchanged from the stub so the
 * wheel wiring and menu tree keep working — but they now drive real audio and
 * update live state (queue, index, playing, positionMs, durationMs, volume).
 *
 * Now Playing frame policy: the frame is pushed ONLY on an explicit user
 * requestPlay(). Background track changes (auto-advance on finish) and
 * next()/prev() never push it, so the wheel's Next/Prev buttons do not yank
 * the user out of whatever screen they are on.
 */

import { create } from 'zustand';

import type { Track } from '../library/types';
import { ExpoAudioEngine, configureAudioMode } from './expoAudio';
import type { PlayerEngine } from './engine';

type PlayerState = {
  queue: Track[];
  index: number;
  playing: boolean;
  current: Track | null;
  positionMs: number;
  durationMs: number;
  volume: number;
  requestPlay: (queue: Track[], startIndex: number) => void;
  togglePlay: () => void;
  next: () => void;
  prev: () => void;
  seek: (ms: number) => void;
  setVolume: (v: number) => void;
};

/** Set by the nav layer so the store can push a frame without importing it. */
let onNowPlaying: ((track: Track | null) => void) | null = null;

export function setNowPlayingHandler(handler: ((track: Track | null) => void) | null): void {
  onNowPlaying = handler;
}

/** The single engine instance backing all playback. */
let engine: PlayerEngine | null = null;
let statusSubscribed = false;

/**
 * Guards against double-advancing on a single track finish. Native may emit
 * several status updates with didJustFinish=true before the new source takes
 * over; only the first one may advance the queue. Cleared by the first
 * didJustFinish=false update after the advance, and by every fresh load.
 */
let advancePending = false;

function getEngine(): PlayerEngine {
  if (!engine) {
    const impl = new ExpoAudioEngine();
    engine = impl;
    void configureAudioMode();
  }
  return engine;
}

/**
 * Advances the queue to `i` (wrapping) and drives the engine in the requested
 * direction. Shared by manual next/prev and auto-advance-on-finish.
 *
 * `dir` decides which engine method is called. prev() MUST call engine.prev():
 * calling next() here made the Prev button skip forward, which is the bug this
 * parameter exists to prevent.
 *
 * Deliberately does NOT push the now-playing frame: this runs for background
 * track changes too, and the user should stay on the screen they are on.
 */
function advanceTo(i: number, dir: 1 | -1): void {
  const s = usePlayerStore.getState();
  if (s.queue.length === 0) return;
  const idx = ((i % s.queue.length) + s.queue.length) % s.queue.length;
  const current = s.queue[idx];
  usePlayerStore.setState({ index: idx, current, positionMs: 0, playing: true });

  const eng = getEngine();
  if (dir === 1) {
    eng.next();
  } else {
    eng.prev();
  }
}

function ensureSubscription(): void {
  if (statusSubscribed) return;
  statusSubscribed = true;

  getEngine().onStatus((status) => {
    const s = usePlayerStore.getState();

    // Auto-advance when the current track finishes. The engine reports
    // didJustFinish during its final status update; move to the next track.
    // Guard: only the first didJustFinish=true after a false may advance.
    if (status.didJustFinish && s.queue.length > 0) {
      if (advancePending) return;
      advancePending = true;
      advanceTo(s.index + 1, 1);
      return;
    }
    if (!status.didJustFinish) {
      advancePending = false;
    }

    // Reconcile index when the engine moved on its own (e.g. after seek/load).
    if (status.index !== s.index && status.index >= 0 && status.index < s.queue.length) {
      const t = s.queue[status.index];
      usePlayerStore.setState({ index: status.index, current: t ?? s.current, positionMs: status.positionMs });
    }

    usePlayerStore.setState({
      positionMs: status.positionMs,
      playing: status.playing,
      durationMs: status.durationMs > 0 ? status.durationMs : s.durationMs,
    });
  });
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  queue: [],
  index: 0,
  playing: false,
  current: null,
  positionMs: 0,
  durationMs: 0,
  volume: 1,

  requestPlay: (queue, startIndex) => {
    if (queue.length === 0) return;
    const index = Math.min(Math.max(startIndex, 0), queue.length - 1);
    const current = queue[index];
    advancePending = false;
    set({ queue, index, current, playing: true, positionMs: 0, durationMs: current.durationMs || 0 });
    console.log('[player] requestPlay', current.title, '-', current.artist);

    ensureSubscription();
    void getEngine()
      .load(queue, index)
      .catch((e) => {
        // A failed load (unreadable uri, engine error) must not crash the app
        // or leave the UI believing audio is playing.
        console.error('[player] load failed', e);
        usePlayerStore.setState({ playing: false });
      });

    // The ONLY place the Now Playing frame is pushed: an explicit user action.
    onNowPlaying?.(current);
  },

  togglePlay: () => {
    const { current, playing } = get();
    if (!current) return;
    const eng = getEngine();
    if (playing) eng.pause();
    else eng.play();
    set({ playing: !playing });
    console.log('[player] togglePlay ->', !playing);
  },

  next: () => {
    const { queue, index } = get();
    if (queue.length === 0) return;
    advanceTo(index + 1, 1);
  },

  prev: () => {
    const { queue, index } = get();
    if (queue.length === 0) return;
    advanceTo(index - 1, -1);
  },

  seek: (ms) => {
    const clamped = Math.max(0, ms);
    getEngine().seek(clamped);
    set({ positionMs: clamped });
  },

  setVolume: (v) => {
    const clamped = Math.min(1, Math.max(0, v));
    getEngine().setVolume(clamped);
    set({ volume: clamped });
  },
}));

/**
 * Fisher-Yates over ids only. Loading 20k full Track rows just to shuffle them
 * would be wasteful, so we shuffle ids and fetch only the head of the queue.
 */
export function shuffleIds(ids: string[]): string[] {
  const out = ids.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}
