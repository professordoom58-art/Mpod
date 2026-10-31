/**
 * Android MediaStore provider. This is the ONLY library file with Platform
 * branching (plus haptics.ts, per the project rules).
 *
 * expo-media-library 58 changed its root API: the legacy getAssetsAsync() is
 * deprecated and THROWS at runtime. The supported surface is Query / Asset,
 * which is what this file uses:
 *   new Query().eq(AssetField.MEDIA_TYPE, MediaType.AUDIO)
 *     .orderBy(...).limit(n).offset(m).exeForMetadata()
 *
 * exeForMetadata() returns cheap MediaStore columns (id, filename, duration,
 * modificationTime) without resolving file paths or decoding files, which is
 * exactly what a scan of thousands of rows needs.
 *
 * Pagination caveats, verified against the installed expo-media-library 58.0.13:
 *   - `Query` has NO count/countAsync method, so a total cannot be fetched up
 *     front. Progress is therefore driven by the returned page size only.
 *   - `AssetField` has NO id column (CREATION_TIME, MODIFICATION_TIME,
 *     MEDIA_TYPE, WIDTH, HEIGHT, DURATION, IS_FAVORITE, MEDIA_SUBTYPES), so the
 *     sort cannot be made fully unique on the id. `orderBy` calls APPEND (see
 *     Query.kt: `orderBy.add(descriptor)`), so we sort by MODIFICATION_TIME
 *     then CREATION_TIME to break the common ties, and dedupe by MediaStore id
 *     so a tie-induced repeat across a page boundary is harmless.
 */

import { Platform } from 'react-native';
import {
  Asset,
  AssetField,
  MediaType,
  Query,
  requestPermissionsAsync,
  type AssetMetadata,
  type PermissionResponse,
} from 'expo-media-library';

import { readMinTrackLengthMs } from './settings';
import type { LibraryProvider, Permission, SourceFile } from './types';

const PAGE_SIZE = 500;

function mapPermission(res: PermissionResponse): Permission {
  if (res.granted) return 'granted';
  // canAskAgain === false means the OS will no longer show the dialog.
  return res.canAskAgain === false ? 'blocked' : 'denied';
}

/** On Android the asset id IS the content:// uri; fall back to resolving it. */
async function uriForAsset(meta: AssetMetadata): Promise<string> {
  if (meta.id.startsWith('content://') || meta.id.startsWith('file://')) {
    return meta.id;
  }
  try {
    return await new Asset(meta.id).getUri();
  } catch {
    return meta.id;
  }
}

export const androidMediaStore: LibraryProvider = {
  name: 'Device Music',
  source: 'mediastore',

  isSupported(): boolean {
    return Platform.OS === 'android';
  },

  async ensurePermission(): Promise<Permission> {
    if (Platform.OS !== 'android') return 'denied';
    try {
      // granularPermissions: ['audio'] maps to READ_MEDIA_AUDIO on Android 13+
      // and READ_EXTERNAL_STORAGE below that.
      const res = await requestPermissionsAsync(false, ['audio']);
      return mapPermission(res);
    } catch {
      return 'denied';
    }
  },

  async listFiles(): Promise<SourceFile[]> {
    if (Platform.OS !== 'android') return [];

    const minLengthMs = await readMinTrackLengthMs();
    const out: SourceFile[] = [];
    // MediaStore ids are unique; keying by id makes duplicate rows (from an
    // offset window that shifted mid-scan) collapse to one entry.
    const seen = new Set<string>();
    let offset = 0;

    // Paged loop: MediaStore can hold tens of thousands of rows, and pulling
    // them all in one call is what makes first scans feel like a freeze.
    for (;;) {
      const page = await new Query()
        .eq(AssetField.MEDIA_TYPE, MediaType.AUDIO)
        .orderBy({ key: AssetField.MODIFICATION_TIME, ascending: true })
        .orderBy({ key: AssetField.CREATION_TIME, ascending: true })
        .limit(PAGE_SIZE)
        .offset(offset)
        .exeForMetadata();

      if (page.length === 0) break;

      let newIds = 0;

      for (const meta of page) {
        if (seen.has(meta.id)) continue;
        seen.add(meta.id);
        newIds += 1;

        const durationMs = meta.duration != null ? Math.round(meta.duration * 1000) : 0;

        // MediaStore's audio bucket includes ringtones, alarms and notification
        // sounds. Anything shorter than the threshold is almost never music.
        if (minLengthMs > 0 && durationMs > 0 && durationMs < minLengthMs) continue;

        const uri = await uriForAsset(meta);
        out.push({
          id: `ms:${meta.id}`,
          uri,
          filename: meta.filename ?? 'Unknown',
          modifiedAt: meta.modificationTime != null ? Math.round(meta.modificationTime * 1000) : 0,
          durationMs: durationMs > 0 ? durationMs : undefined,
        });
      }

      // A page made entirely of ids we already saw means the underlying
      // MediaStore changed during the scan and offset no longer maps to a
      // stable window. Stop instead of looping on the same rows forever.
      if (newIds === 0) break;

      if (page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    return out;
  },
};
