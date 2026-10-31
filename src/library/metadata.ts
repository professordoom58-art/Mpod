/**
 * Tag reading.
 *
 * Reader choice: @missingcore/react-native-metadata-retriever 3.2.1.
 *
 * Why: it is the only option that reads tags from a content:// URI without
 * first copying the file, it is native (so it is fast enough for a 20k scan),
 * it returns albumArtist / trackNumber / discNumber / artwork, and it falls
 * back to the old MediaMetadataRetriever for ID3v1-only files. Verified in the
 * installed package that it builds a MediaItem via MediaItem.fromUri(...), so
 * content:// works. It is Android-only, which is fine: iOS uses the imported
 * files path, and on iOS this module degrades to the filename fallback.
 *
 * Deliberate doubt: it is a third-party native module on an unstable AndroidX
 * API. It is isolated behind readTags() so swapping it is a one-file change.
 *
 * Fallback chain when tags are missing or unreadable:
 *   parseFilename() -> parent folder name as album -> Unknown Artist/Album.
 * A single bad file never aborts a scan; failures are counted by the indexer.
 */

import { Platform } from 'react-native';

import { base64ByteLength } from './base64Size';
import { artworkFilenameFor } from './db';
import { relativeFileExists, writeBase64File } from './resolveUri';
import { parseFilename } from './sortKey';
import type { SourceFile, Tags } from './types';

const ARTWORK_DIR = 'artwork';

/**
 * Hard cap on embedded artwork, measured in DECODED bytes. Anything larger is
 * skipped rather than written (no image manipulator on purpose: downscaling
 * would need a new native dependency). 1.5 MB comfortably covers a 600x600
 * JPEG, which is what virtually every album tag carries, and keeps the
 * document directory from gaining hundreds of megabytes on a big library.
 */
export const MAX_ARTWORK_BYTES = 1_500_000;

/**
 * Single-flight map keyed by the deterministic artwork path (album + album
 * artist). Concurrent readTags() calls for tracks of the same album share one
 * extraction+write instead of racing to write the same file.
 */
const artworkInFlight = new Map<string, Promise<string | undefined>>();

type MetadataModule = typeof import('@missingcore/react-native-metadata-retriever');

let metadataModule: MetadataModule | null = null;
let metadataLoadFailed = false;

function loadMetadata(): MetadataModule | null {
  if (Platform.OS !== 'android') return null;
  if (metadataModule) return metadataModule;
  if (metadataLoadFailed) return null;
  try {
    // Required lazily so a missing/unsupported native module cannot break the
    // app at import time on iOS or in a JS-only environment.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    metadataModule = require('@missingcore/react-native-metadata-retriever') as MetadataModule;
    return metadataModule;
  } catch {
    metadataLoadFailed = true;
    return null;
  }
}

/** The fields we ask for. Narrower reads are faster. */
const FIELDS = [
  'title',
  'artist',
  'albumArtist',
  'albumTitle',
  'trackNumber',
  'discNumber',
] as const;

/** Folder name of a uri or path, used as the album fallback. */
function parentFolderName(file: SourceFile): string | undefined {
  const source = file.relPath ?? file.uri;
  const withoutQuery = source.split('?')[0];
  const parts = withoutQuery.split('/').filter(Boolean);
  // Drop the filename itself.
  if (parts.length < 2) return undefined;
  const parent = parts[parts.length - 2];
  if (!parent || parent.includes(':')) return undefined;
  return parent;
}

/**
 * Reads tags for one file. Never throws: on any failure it returns whatever
 * the filename fallback can produce, so the caller only has to count.
 */
export async function readTags(file: SourceFile): Promise<Tags> {
  const tags: Tags = {};

  const mod = loadMetadata();
  if (mod) {
    try {
      const meta = await mod.getMetadata(file.uri, FIELDS);
      if (meta.title) {
        tags.title = meta.title;
        tags.tagsFromFile = true;
      }
      if (meta.artist) tags.artist = meta.artist;
      if (meta.albumArtist) tags.albumArtist = meta.albumArtist;
      if (meta.albumTitle) tags.album = meta.albumTitle;
      if (typeof meta.trackNumber === 'number' && meta.trackNumber > 0) {
        tags.trackNo = meta.trackNumber;
      }
      if (typeof meta.discNumber === 'number' && meta.discNumber > 0) {
        tags.discNo = meta.discNumber;
      }
    } catch {
      /* unreadable tags: fall through to the filename chain */
    }
  }

  if (file.durationMs && file.durationMs > 0) {
    tags.durationMs = file.durationMs;
  }

  // Fallback 1: filename.
  if (!tags.title) {
    const parsed = parseFilename(file.filename);
    tags.title = parsed.title;
    if (!tags.artist && parsed.artist) tags.artist = parsed.artist;
  }

  // Fallback 2: parent folder as album.
  if (!tags.album) {
    const folder = parentFolderName(file);
    if (folder) tags.album = folder;
  }

  return tags;
}

/**
 * Extracts embedded artwork and writes it to documentDirectory/artwork/.
 * Deduped per album via fnv(album + albumArtist), so a 12-track album writes
 * one image. Returns the path relative to documentDirectory.
 *
 * Order of operations matters:
 *   1. an existing file wins, so a re-scan never re-decodes base64;
 *   2. concurrent callers for the same album share one in-flight promise;
 *   3. oversized artwork is skipped BEFORE the base64 is written to disk.
 */
export async function readArtwork(
  file: SourceFile,
  album: string,
  albumArtist: string,
): Promise<string | undefined> {
  const mod = loadMetadata();
  if (!mod) return undefined;

  const relPath = `${ARTWORK_DIR}/${artworkFilenameFor(album, albumArtist)}`;

  // Cheap stat before touching the tag reader at all.
  if (relativeFileExists(relPath)) return relPath;

  const inFlight = artworkInFlight.get(relPath);
  if (inFlight) return inFlight;

  const job = (async (): Promise<string | undefined> => {
    try {
      const base64 = await mod.getArtwork(file.uri);
      if (!base64) return undefined;

      if (base64ByteLength(base64) > MAX_ARTWORK_BYTES) return undefined;

      // Another album's track may have finished writing while we decoded.
      if (relativeFileExists(relPath)) return relPath;

      await writeBase64File(relPath, base64);
      return relPath;
    } catch {
      return undefined;
    }
  })();

  artworkInFlight.set(relPath, job);
  try {
    return await job;
  } finally {
    artworkInFlight.delete(relPath);
  }
}

/** True when a real native tag reader is available on this platform. */
export function hasNativeTagReader(): boolean {
  return loadMetadata() !== null;
}
