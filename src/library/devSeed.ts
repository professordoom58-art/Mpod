/**
 * DEV ONLY. Seeds fake tracks so wheel and list performance can be tested at
 * 5,000 and 20,000 rows without a real music library.
 *
 * Guarded by __DEV__ at the call site; this module also refuses to run in
 * production builds.
 */

import { clearLibrary, upsertTracks } from './db';
import { fnvHex } from './fnv';
import { sortKey } from './sortKey';
import type { Track } from './types';

const ARTISTS = [
  'The Beatles',
  'A Tribe Called Quest',
  'Björk',
  'Sigur Rós',
  'The National',
  'Massive Attack',
  'Radiohead',
  'An Coimisiún',
  'Daft Punk',
  'Fleetwood Mac',
  'The Cure',
  'Portishead',
  'Aphex Twin',
  'Nina Simone',
  'Talk Talk',
];

const ALBUM_WORDS = [
  'Blue',
  'Rumours',
  'Kid A',
  'Homogenic',
  'Mezzanine',
  'Dummy',
  'In Rainbows',
  'Ágætis byrjun',
  'Discovery',
  'Tusk',
  'Disintegration',
  'Selected Ambient Works',
];

const TITLE_WORDS = [
  'Intro',
  'Run',
  'Drift',
  'Nightfall',
  'Signal',
  'Static',
  'Harbour',
  'Cascade',
  'Ember',
  'Glass',
  'Undertow',
  'Vessel',
];

function pick<T>(arr: readonly T[], i: number): T {
  return arr[i % arr.length];
}

/**
 * Inserts `n` fake tracks. Wipes the existing library first so the row count
 * is exactly what was asked for.
 */
export async function seedFakeTracks(n: number): Promise<number> {
  if (!__DEV__) return 0;

  await clearLibrary();

  const now = Date.now();
  const batch: Track[] = [];
  const BATCH = 500;

  for (let i = 0; i < n; i += 1) {
    const artist = pick(ARTISTS, i);
    const album = pick(ALBUM_WORDS, Math.floor(i / 12));
    const title = `${pick(TITLE_WORDS, i)} ${Math.floor(i / 12) + 1}`;
    const id = `dev:${fnvHex(`${artist}:${album}:${i}`)}`;

    batch.push({
      id,
      source: 'imported',
      uri: `file:///dev/null/${i}.mp3`,
      relPath: undefined,
      title,
      artist,
      album,
      albumArtist: artist,
      trackNo: (i % 12) + 1,
      discNo: 1,
      durationMs: 180000 + (i % 90) * 1000,
      artworkPath: undefined,
      addedAt: now,
      modifiedAt: now,
    });

    if (batch.length >= BATCH) {
      await upsertTracks(batch.splice(0, batch.length));
    }
  }

  if (batch.length > 0) await upsertTracks(batch);

  return n;
}

/** Exposed so a test can assert the sort key used for seeded names. */
export const devSeedSortKey = sortKey;
