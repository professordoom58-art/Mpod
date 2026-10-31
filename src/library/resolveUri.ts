/**
 * Uri resolution.
 *
 * Imported files and artwork are stored as paths RELATIVE to the document
 * directory. On iOS the app container path changes across updates and
 * reinstalls, so an absolute path saved today is a broken path tomorrow.
 * MediaStore uris are content:// and are stable, so they are stored as-is.
 */

import { Directory, File, Paths } from 'expo-file-system';

import type { Track } from './types';

/** Absolute document directory uri, with a trailing slash. */
export function documentDirUri(): string {
  const uri = Paths.document.uri;
  return uri.endsWith('/') ? uri : `${uri}/`;
}

/** Joins a document-relative path onto the current document directory. */
export function resolveRelative(relPath: string): string {
  const clean = relPath.replace(/^\/+/, '');
  return `${documentDirUri()}${clean}`;
}

/** The uri to hand to the audio engine for a track. */
export function resolveTrackUri(track: Pick<Track, 'source' | 'uri' | 'relPath'>): string {
  if (track.source === 'imported') {
    if (!track.relPath) return track.uri;
    return resolveRelative(track.relPath);
  }
  return track.uri;
}

/** The uri to hand to <Image> for album artwork, or undefined if none. */
export function resolveArtworkUri(artworkPath: string | undefined | null): string | undefined {
  if (!artworkPath) return undefined;
  return resolveRelative(artworkPath);
}

/** Ensures a document-relative directory exists. */
export function ensureDirectory(relPath: string): Directory {
  const dir = new Directory(Paths.document, relPath);
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
  return dir;
}

/** Writes base64 image data to a document-relative path. Returns the rel path. */
export async function writeBase64File(relPath: string, base64: string): Promise<string> {
  const file = new File(Paths.document, relPath);
  const parent = file.parentDirectory;
  if (parent && !parent.exists) {
    parent.create({ intermediates: true, idempotent: true });
  }
  await file.write(base64, { encoding: 'base64' });
  return relPath;
}

/** True when the file behind a document-relative path still exists. */
export function relativeFileExists(relPath: string): boolean {
  try {
    return new File(Paths.document, relPath).exists;
  } catch {
    return false;
  }
}

/** Deletes a document-relative file if present. Never throws. */
export function deleteRelativeFile(relPath: string): void {
  try {
    const file = new File(Paths.document, relPath);
    if (file.exists) file.delete();
  } catch {
    /* already gone, or unreadable: nothing to do */
  }
}
