/**
 * Playback stub. Phase 4 replaces the bodies with a real engine; the
 * signatures below are the contract and must not change.
 *
 * The only real behaviour here is pushing a "nowplaying" frame, so the menu
 * tree can prove the wiring end to end.
 */

import { create } from 'zustand';

import type { Track } from '../library/types';

type PlayerState = {
  queue: Track[];
  index: number;
  playing: boolean;
  current: Track | null;
  requestPlay: (queue: Track[], startIndex: number) => void;
  togglePlay: () => void;
  next: () => void;
  prev: () => void;
};

/** Set by the nav layer so the stub can push a frame without importing it. */
let onNowPlaying: ((track: Track | null) => void) | null = null;

export function setNowPlayingHandler(handler: ((track: Track | null) => void) | null): void {
  onNowPlaying = handler;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  queue: [],
  index: 0,
  playing: false,
  current: null,

  requestPlay: (queue, startIndex) => {
    if (queue.length === 0) return;
    const index = Math.min(Math.max(startIndex, 0), queue.length - 1);
    const current = queue[index];
    set({ queue, index, current, playing: true });
    console.log('[player stub] requestPlay', current.title, '-', current.artist);
    onNowPlaying?.(current);
  },

  togglePlay: () => {
    const { current, playing } = get();
    if (!current) return;
    set({ playing: !playing });
    console.log('[player stub] togglePlay ->', !playing);
  },

  next: () => {
    const { queue, index } = get();
    if (queue.length === 0) return;
    const nextIndex = (index + 1) % queue.length;
    const current = queue[nextIndex];
    set({ index: nextIndex, current, playing: true });
    console.log('[player stub] next ->', current.title);
    onNowPlaying?.(current);
  },

  prev: () => {
    const { queue, index } = get();
    if (queue.length === 0) return;
    const prevIndex = (index - 1 + queue.length) % queue.length;
    const current = queue[prevIndex];
    set({ index: prevIndex, current, playing: true });
    console.log('[player stub] prev ->', current.title);
    onNowPlaying?.(current);
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
