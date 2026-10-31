/**
 * The sync engine: list -> diff -> read tags for new/changed only -> upsert ->
 * prune. Concurrency 4 with a yield between batches so the wheel keeps
 * responding during a 20k scan.
 */

import {
  deleteTracksNotIn,
  getIndexedFiles,
  upsertTracks,
} from './db';
import { readArtwork, readTags } from './metadata';
import {
  UNKNOWN_ALBUM,
  UNKNOWN_ARTIST,
  type LibraryProvider,
  type Permission,
  type ScanProgress,
  type ScanResult,
  type SourceFile,
  type Track,
} from './types';

const CONCURRENCY = 4;

export type SyncOptions = {
  /** Skip artwork extraction. Faster, used by the dev seeder and tests. */
  skipArtwork?: boolean;
  /** Force a full re-read even when modifiedAt is unchanged. */
  force?: boolean;
  /**
   * Permission state the caller already resolved. Used by the prune guard: a
   * MediaStore scan must pass 'granted' before anything can be deleted.
   * Imported files need no permission, so they prune regardless.
   */
  permission?: Permission;
};

/** Lets the JS thread breathe so wheel input is not starved. */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function buildTrack(
  file: SourceFile,
  source: Track['source'],
  tags: Awaited<ReturnType<typeof readTags>>,
  artworkPath: string | undefined,
  now: number,
): Track {
  return {
    id: file.id,
    source,
    uri: file.uri,
    relPath: file.relPath,
    title: tags.title?.trim() || file.filename,
    artist: tags.artist?.trim() || UNKNOWN_ARTIST,
    album: tags.album?.trim() || UNKNOWN_ALBUM,
    albumArtist:
      tags.albumArtist?.trim() || tags.artist?.trim() || UNKNOWN_ARTIST,
    trackNo: tags.trackNo ?? 0,
    discNo: tags.discNo ?? 0,
    durationMs: tags.durationMs ?? file.durationMs ?? 0,
    artworkPath,
    addedAt: now,
    modifiedAt: file.modifiedAt,
  };
}

export async function syncLibrary(
  provider: LibraryProvider,
  onProgress?: (p: ScanProgress) => void,
  opts?: SyncOptions,
): Promise<ScanResult> {
  const startedAt = Date.now();

  onProgress?.({ phase: 'listing', done: 0, total: 0, message: 'Finding music' });

  const files = await provider.listFiles();

  onProgress?.({ phase: 'listing', done: files.length, total: files.length });

  const indexed = await getIndexedFiles(provider.source);

  const pending: SourceFile[] = [];
  let updatedCount = 0;

  for (const file of files) {
    const known = indexed.get(file.id);
    if (known === undefined) {
      pending.push(file);
    } else if (opts?.force || known !== file.modifiedAt) {
      pending.push(file);
      updatedCount += 1;
    }
  }

  const addedCount = pending.length - updatedCount;

  const now = Date.now();
  const tracks: Track[] = [];
  let failed = 0;
  let fallbackTags = 0;
  let processed = 0;

  onProgress?.({ phase: 'reading', done: 0, total: pending.length });

  for (let offset = 0; offset < pending.length; offset += CONCURRENCY) {
    const batch = pending.slice(offset, offset + CONCURRENCY);

    const results = await Promise.all(
      batch.map(async (file) => {
        try {
          const tags = await readTags(file);
          if (tags.tagsFromFile !== true) fallbackTags += 1;
          let artworkPath: string | undefined;
          if (!opts?.skipArtwork) {
            const album = tags.album?.trim() || UNKNOWN_ALBUM;
            const albumArtist =
              tags.albumArtist?.trim() || tags.artist?.trim() || UNKNOWN_ARTIST;
            artworkPath = await readArtwork(file, album, albumArtist);
          }
          return buildTrack(file, provider.source, tags, artworkPath, now);
        } catch {
          failed += 1;
          return null;
        }
      }),
    );

    for (const track of results) {
      if (track) tracks.push(track);
    }

    processed += batch.length;
    onProgress?.({
      phase: 'reading',
      done: processed,
      total: pending.length,
      message: failed > 0 ? `${failed} unreadable` : undefined,
    });

    // Yield between batches: without this the wheel stutters on a big scan.
    await yieldToEventLoop();
  }

  onProgress?.({ phase: 'saving', done: 0, total: tracks.length, message: 'Saving' });

  await upsertTracks(tracks);

  onProgress?.({ phase: 'saving', done: tracks.length, total: tracks.length });

  // Prune rows whose files are gone. Applies to both sources: for imported
  // files this is how a deleted file leaves the index.
  //
  // GUARD: an empty listing is far more likely to mean "permission was revoked"
  // than "the user deleted every song". Pruning on an empty listing would wipe
  // the index the moment access is lost. So prune only when:
  //   1. permission is granted (imported files need none), AND
  //   2. we actually saw files, OR the index was already empty (nothing to
  //      lose, which also lets a first scan clean up a broken index row).
  const keepIds = files.map((f) => f.id);

  const permissionGranted =
    provider.source === 'imported' ? true : opts?.permission === 'granted';

  const canPrune =
    permissionGranted && (files.length > 0 || indexed.size === 0);

  const removed = canPrune
    ? await deleteTracksNotIn(provider.source, keepIds)
    : 0;

  const result: ScanResult = {
    added: Math.max(0, addedCount),
    updated: updatedCount,
    removed,
    failed,
    total: files.length,
    ms: Date.now() - startedAt,
    fallbackTags,
  };

  onProgress?.({ phase: 'done', done: files.length, total: files.length });

  return result;
}
