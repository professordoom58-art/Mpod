/**
 * Library state. Single-flight: a second scan() while one is running is a
 * no-op, not a queue, because a queued scan would double the work for nothing.
 */

import { create } from 'zustand';

import {
  clearLibrary,
  countAlbums,
  countArtists,
  countTracks,
  initDb,
} from './db';
import { pickAndImport } from './importedFiles';
import { syncLibrary } from './indexer';
import { getPrimaryProvider, importedFiles } from './providers';
import { loadSettings, recordScan, type Settings } from './settings';
import type { LibraryProvider, Permission, ScanProgress, ScanResult } from './types';

type Counts = {
  tracks: number;
  artists: number;
  albums: number;
};

type LibraryState = {
  ready: boolean;
  permission: Permission | null;
  scanning: boolean;
  progress: ScanProgress | null;
  lastResult: ScanResult | null;
  lastScanAt: number | null;
  error: string | null;
  counts: Counts;
  /** Persisted settings, loaded once at boot. */
  settings: Settings | null;

  init: () => Promise<void>;
  requestPermission: () => Promise<Permission>;
  scan: (provider?: LibraryProvider) => Promise<ScanResult | null>;
  importFiles: () => Promise<ScanResult | null>;
  refreshCounts: () => Promise<void>;
  resetLibrary: () => Promise<void>;
  setPermission: (p: Permission) => void;
  setSettings: (s: Settings) => void;
};

export const useLibraryStore = create<LibraryState>((set, get) => ({
  ready: false,
  permission: null,
  scanning: false,
  progress: null,
  lastResult: null,
  lastScanAt: null,
  error: null,
  counts: { tracks: 0, artists: 0, albums: 0 },
  settings: null,

  init: async () => {
    if (get().ready) return;
    try {
      await initDb();
      const [counts, settings] = await Promise.all([readCounts(), loadSettings()]);
      set({ ready: true, counts, settings });
    } catch (e) {
      set({ ready: true, error: e instanceof Error ? e.message : String(e) });
    }
  },

  setSettings: (settings) => set({ settings }),

  requestPermission: async () => {
    const provider = getPrimaryProvider();
    try {
      const permission = await provider.ensurePermission();
      set({ permission });
      return permission;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      set({ permission: 'denied' });
      return 'denied';
    }
  },

  setPermission: (permission) => set({ permission }),

  scan: async (providerArg) => {
    if (get().scanning) return null;
    const provider = providerArg ?? getPrimaryProvider();

    set({ scanning: true, error: null, progress: { phase: 'listing', done: 0, total: 0 } });

    try {
      // Resolve permission from the provider before syncing. The prune guard
      // in syncLibrary only deletes when permission is 'granted', so passing a
      // stale/undefined value here silently disabled pruning and deleted
      // tracks never left the index.
      let permission = get().permission;
      if (permission !== 'granted') {
        permission = await provider.ensurePermission();
        set({ permission });
      }

      const result = await syncLibrary(provider, (p) => set({ progress: p }), {
        permission: permission ?? undefined,
      });
      await recordScan({
        ms: result.ms,
        failed: result.failed,
        fallbackTags: result.fallbackTags,
      });
      const counts = await readCounts();
      set({
        scanning: false,
        progress: null,
        lastResult: result,
        lastScanAt: Date.now(),
        counts,
      });
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({
        scanning: false,
        progress: { phase: 'error', done: 0, total: 0, message },
        error: message,
      });
      return null;
    }
  },

  importFiles: async () => {
    if (get().scanning) return null;
    set({ scanning: true, error: null, progress: { phase: 'listing', done: 0, total: 0 } });

    try {
      await pickAndImport((p) =>
        set({
          progress: {
            phase: 'listing',
            done: p.done,
            total: p.total,
            message: 'Importing',
          },
        }),
      );
      set({ scanning: false, progress: null });
      // Imported files still need indexing to get tags and rows.
      return await get().scan(importedFiles);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ scanning: false, progress: { phase: 'error', done: 0, total: 0, message }, error: message });
      return null;
    }
  },

  refreshCounts: async () => {
    const counts = await readCounts();
    set({ counts });
  },

  resetLibrary: async () => {
    await clearLibrary();
    const counts = await readCounts();
    set({ counts, lastResult: null, lastScanAt: null });
  },
}));

async function readCounts(): Promise<Counts> {
  const [tracks, artists, albums] = await Promise.all([
    countTracks(),
    countArtists(),
    countAlbums(),
  ]);
  return { tracks, artists, albums };
}
