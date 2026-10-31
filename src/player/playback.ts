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

/** Plays a queue given ids, starting at startIndex. */
export async function requestPlayByIds(ids: string[], startIndex: number): Promise<void> {
  if (ids.length === 0) return;

  const window = ids.slice(0, MAX_MATERIALISED_QUEUE);
  const tracks = await getTracksByIds(window);
  if (tracks.length === 0) return;

  const index = Math.min(Math.max(startIndex, 0), tracks.length - 1);
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
