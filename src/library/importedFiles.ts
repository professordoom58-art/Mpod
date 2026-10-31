/**
 * Imported-files provider. Cross-platform: works on Android and iOS.
 *
 * Files are copied into documentDirectory/music/ and stored as paths relative
 * to the document directory, because the iOS app container path changes across
 * updates and reinstalls.
 */

import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';

import { fnvHex } from './fnv';
import { ensureDirectory } from './resolveUri';
import type { LibraryProvider, Permission, SourceFile } from './types';

export const MUSIC_DIR = 'music';

const AUDIO_EXTENSIONS = [
  '.mp3',
  '.m4a',
  '.aac',
  '.flac',
  '.ogg',
  '.oga',
  '.opus',
  '.wav',
  '.wma',
  '.aiff',
  '.aif',
  '.alac',
];

function hasAudioExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Splits "name.mp3" into ["name", ".mp3"] so collisions can be suffixed. */
function splitName(name: string): [string, string] {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return [name, ''];
  return [name.slice(0, dot), name.slice(dot)];
}

/** Picks a filename that does not already exist in the music directory. */
function uniqueName(dir: Directory, desired: string): string {
  if (!new File(dir, desired).exists) return desired;

  const [base, ext] = splitName(desired);
  for (let i = 2; i < 1000; i += 1) {
    const candidate = `${base} (${i})${ext}`;
    if (!new File(dir, candidate).exists) return candidate;
  }
  return `${base} (${Date.now()})${ext}`;
}

export type ImportProgress = {
  done: number;
  total: number;
  message?: string;
};

/**
 * Opens the system picker and copies the chosen audio files into the app's
 * document directory. Returns the SourceFile rows that were imported.
 */
export async function pickAndImport(
  onProgress?: (p: ImportProgress) => void,
): Promise<SourceFile[]> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'audio/*',
    multiple: true,
    // Keep the cache copy ON. The picker hands back a content:// uri, and
    // expo-file-system's File.copy cannot reliably stream a SAF content uri
    // into the document directory. With the cache copy the uri is a real
    // file:// path we can copy. The extra IO is worth the reliability.
    copyToCacheDirectory: true,
  });

  if (result.canceled) return [];

  const dir = ensureDirectory(MUSIC_DIR);
  const imported: SourceFile[] = [];
  const total = result.assets.length;

  onProgress?.({ done: 0, total });

  for (let i = 0; i < result.assets.length; i += 1) {
    const asset = result.assets[i];
    const source = new File(asset.uri);
    let partFile: File | null = null;

    try {
      const name = uniqueName(dir, asset.name || `import-${Date.now()}.mp3`);
      const destination = new File(dir, name);
      // Stage the copy under a .part name so a kill mid-copy can never leave a
      // half-written file that listFiles() would index as a real track.
      partFile = new File(dir, `${name}.part`);

      // copy() is async in the new File API; copySync() exists too but this
      // keeps the JS thread free during a multi-file import.
      await source.copy(partFile);

      // Promote the staged file to its final name. move() is async and
      // overwrites nothing, because uniqueName() already guaranteed `name`
      // was free.
      await partFile.move(destination);
      partFile = null;

      const relPath = `${MUSIC_DIR}/${name}`;
      const sizeBytes = destination.exists ? destination.size : asset.size;

      imported.push({
        id: `imp:${fnvHex(`${name}:${sizeBytes ?? 0}`)}`,
        uri: destination.uri,
        relPath,
        filename: name,
        modifiedAt: Date.now(),
        sizeBytes: sizeBytes ?? undefined,
      });
    } catch {
      /* one failed copy must not abort the rest of the import */
    } finally {
      // Never leave a partial file behind, whatever happened above.
      if (partFile) {
        try {
          if (partFile.exists) partFile.delete();
        } catch {
          /* already gone */
        }
      }
      // The cache copy is ours; delete it even when the copy failed so a
      // failed import does not accumulate cache garbage.
      try {
        if (source.exists) source.delete();
      } catch {
        /* cache is disposable either way */
      }
    }

    onProgress?.({ done: i + 1, total });
  }

  return imported;
}

export const importedFiles: LibraryProvider = {
  name: 'Imported Files',
  source: 'imported',

  isSupported(): boolean {
    return true;
  },

  async ensurePermission(): Promise<Permission> {
    // No runtime permission needed: the picker grants access per file.
    return 'granted';
  },

  async listFiles(): Promise<SourceFile[]> {
    const dir = new Directory(Paths.document, MUSIC_DIR);
    if (!dir.exists) return [];

    const entries = dir.list();
    const out: SourceFile[] = [];

    for (const entry of entries) {
      if (!(entry instanceof File)) continue;
      // Skip staging files: a .part is a copy that never finished, not a track.
      if (entry.name.endsWith('.part')) continue;
      if (!hasAudioExtension(entry.name)) continue;

      try {
        if (!entry.exists) continue;
        const size = entry.size;
        const modified = entry.modificationTime;
        out.push({
          id: `imp:${fnvHex(`${entry.name}:${size ?? 0}`)}`,
          uri: entry.uri,
          relPath: `${MUSIC_DIR}/${entry.name}`,
          filename: entry.name,
          modifiedAt: modified != null ? Math.round(modified) : 0,
          sizeBytes: size ?? undefined,
        });
      } catch {
        /* unreadable entry: skip it rather than failing the whole listing */
      }
    }

    return out;
  },
};
