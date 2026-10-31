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

import { savePlaybackSession } from '../library/settings';
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
  /**
   * Cold-boot resume: pre-populates the screen in a paused state without
   * touching the engine. The first togglePlay() loads and seeks.
   */
  restoreSession: (track: Track, positionMs: number) => void;
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

/**
 * Position the next play() must jump to, set by restoreSession(). null means
 * no pending resume, i.e. a normal load/play path.
 */
let resumePending: number | null = null;

/** Throttle for the ~5 s playback checkpoint written to SQLite. */
const PERSIST_INTERVAL_MS = 5000;
let lastPersistAt = 0;

function persistSession(): void {
  const { current, positionMs } = usePlayerStore.getState();
  void savePlaybackSession(current?.id ?? null, positionMs).catch((e) => {
    console.error('[player] session save failed', e);
  });
}

function getEngine(): PlayerEngine {
  if (!engine) {
    const impl = new ExpoAudioEngine();
    engine = impl;
    // Configure the audio session once. A rejected setAudioModeAsync (e.g. a
    // missing native module in an old dev client) must not surface as an
    // unhandled rejection; playback then simply uses the default session.
    void configureAudioMode().catch((e) => {
      console.error('[player] configureAudioMode failed', e);
    });
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
  if (resumePending !== null) {
    // A cold-boot session was never loaded into the engine, so next()/prev()
    // would move a queue the engine does not have. Load the new index instead.
    resumePending = null;
    void eng.load(s.queue, idx).catch((e) => {
      console.error('[player] advance after resume failed', e);
      usePlayerStore.setState({ playing: false });
    });
  } else if (dir === 1) {
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

    // ~5 s checkpoint so a cold boot can resume the current position.
    const now = Date.now();
    if (status.playing && now - lastPersistAt >= PERSIST_INTERVAL_MS) {
      lastPersistAt = now;
      void savePlaybackSession(s.current?.id ?? null, status.positionMs).catch((e) => {
        console.error('[player] session save failed', e);
      });
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
    resumePending = null;
    lastPersistAt = 0;
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
    const { current, playing, queue, index } = get();
    if (!current) return;

    if (playing) {
      getEngine().pause();
      set({ playing: false });
      // Pausing is the other checkpoint: the position the user stopped at is
      // exactly the one a cold boot should resume.
      persistSession();
      console.log('[player] togglePlay -> false');
      return;
    }

    // Resuming a cold-boot session: nothing is loaded in the engine yet, so
    // load (which starts playback) and then jump to the saved position.
    if (resumePending !== null) {
      const at = resumePending;
      resumePending = null;
      set({ playing: true });
      ensureSubscription();
      void getEngine()
        .load(queue, index)
        .then(() => {
          if (at > 0) getEngine().seek(at);
        })
        .catch((e) => {
          console.error('[player] resume failed', e);
          usePlayerStore.setState({ playing: false });
        });
      console.log('[player] togglePlay -> resume at', at);
      return;
    }

    getEngine().play();
    set({ playing: true });
    console.log('[player] togglePlay -> true');
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

  restoreSession: (track, positionMs) => {
    const at = Math.max(0, Math.round(positionMs));
    resumePending = at;
    lastPersistAt = 0;
    set({
      queue: [track],
      index: 0,
      current: track,
      playing: false,
      positionMs: at,
      durationMs: track.durationMs || 0,
    });
    console.log('[player] restored session', track.title, 'at', at);
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
