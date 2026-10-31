/**
 * Thin bridge between the menu tree and the player store.
 *
 * Kept separate from player/store.ts so the store stays the stable Phase 4
 * contract, and the queue-loading policy (how many rows we materialise) lives
 * in one obvious place.
 */

import { getAllTrackIds, getTracksByIds } from '../library/db';
import { shuffleIds, usePlayerStore } from './store';

/**
 * Materialises at most this many tracks for a queue. A 20k-track "shuffle all"
 * must not build 20k Track objects; Phase 4 will stream the rest from ids.
 */
export const MAX_MATERIALISED_QUEUE = 200;

/**
 * Plays a queue given ids, starting at startIndex.
 *
 * Only a bounded window around the selection is materialised (a 20k-track
 * library must not build 20k Track objects).
 *
 * The window is CENTERED on startIndex rather than starting at it, so the
 * selected track lands in the middle of the queue and prev() has real history
 * to walk back into. Starting the window at the selection made the selected
 * track queue index 0, so prev() wrapped straight to the END of the window and
 * played the wrong song.
 *
 * The window is a contiguous slice of the id list, clamped so it never runs
 * past either end; the selected track is placed at its own offset inside it.
 */
export async function requestPlayByIds(ids: string[], startIndex: number): Promise<void> {
  if (ids.length === 0) return;

  const total = ids.length;
  const start = Math.min(Math.max(startIndex, 0), Math.max(0, total - 1));

  // How many tracks to take before the selection. Half the window, but never
  // more than exist before `start`.
  const before = Math.min(Math.floor(MAX_MATERIALISED_QUEUE / 2), start);
  const windowStart = start - before;
  const windowEnd = Math.min(total, windowStart + MAX_MATERIALISED_QUEUE);

  const window = ids.slice(windowStart, windowEnd);
  const tracks = await getTracksByIds(window);
  if (tracks.length === 0) return;

  // The selection's position inside the materialised window.
  const index = start - windowStart;

  usePlayerStore.getState().requestPlay(tracks, index);
}

/** Plays exactly one track by id. */
export async function playTrackById(id: string): Promise<void> {
  const tracks = await getTracksByIds([id]);
  if (tracks.length === 0) return;
  usePlayerStore.getState().requestPlay(tracks, 0);
}

/** Shuffle Songs: shuffle ids, then materialise only the head of the queue. */
export async function shuffleAndPlay(allIds?: string[]): Promise<void> {
  const ids = allIds ?? (await getAllTrackIds());
  if (ids.length === 0) return;

  const shuffled = shuffleIds(ids);
  const tracks = await getTracksByIds(shuffled.slice(0, MAX_MATERIALISED_QUEUE));
  if (tracks.length === 0) return;

  usePlayerStore.getState().requestPlay(tracks, 0);
}
