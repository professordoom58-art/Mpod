/**
 * The menu tree. Everything here builds Rows and pushes Frames; no rendering.
 *
 * Rows are built lazily through loaders so a 20k-track library never builds
 * thousands of Row objects just to show the first screen.
 */

import { Linking, Platform } from 'react-native';

import {
  countTracks,
  getAllTrackIds,
  getAlbums,
  getArtists,
  getTracks,
  getTracksByIds,
} from '../library/db';
import { hasNativeTagReader } from '../library/metadata';
import { getPrimaryProvider } from '../library/providers';
import {
  MIN_TRACK_LENGTH_CHOICES,
  WHEEL_TICK_MAX,
  WHEEL_TICK_MIN,
  loadSettings,
  setHapticsEnabled as persistHaptics,
  setMinTrackLengthMs,
  setWheelTickDeg,
} from '../library/settings';
import { useLibraryStore } from '../library/store';
import type { Track } from '../library/types';
import { setHapticsEnabled } from '../haptics/haptics';
import {
  playTrackById,
  requestPlayByIds,
  shuffleAndPlay,
} from '../player/playback';
import { useMenuStore, type Row } from './menuStack';

const isAndroid = Platform.OS === 'android';

/** Empty-library message, worded per platform. */
function emptyLibraryRow(): Row {
  return {
    id: 'empty',
    label: 'No music',
    sub: isAndroid ? 'Settings > Update Library' : 'Settings > Import Files',
  };
}

/** Permission recovery rows. */
function permissionRows(): Row[] {
  const permission = useLibraryStore.getState().permission;
  if (permission === 'denied') {
    return [
      {
        id: 'allow',
        label: 'Allow access',
        sub: 'Tap Select to grant',
        onSelect: () => {
          void useLibraryStore.getState().requestPermission();
        },
      },
    ];
  }
  if (permission === 'blocked') {
    return [
      {
        id: 'open-settings',
        label: 'Open Settings',
        sub: 'Permission is off',
        onSelect: () => {
          void Linking.openSettings();
        },
      },
    ];
  }
  return [];
}

/** Wraps a track list into rows that request playback on select. */
function trackRows(tracks: Awaited<ReturnType<typeof getTracks>>, queueIds: string[]): Row[] {
  return tracks.map((t, i) => ({
    id: t.id,
    label: t.title,
    sub: t.artist,
    onSelect: () => {
      void requestPlayByIds(queueIds, i);
    },
  }));
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

function settingsRows(): Row[] {
  const rows: Row[] = [];

  if (isAndroid) {
    rows.push({
      id: 'update-library',
      label: 'Update Library',
      onSelect: () => {
        void runScan();
      },
    });
  }

  rows.push({
    id: 'import-files',
    label: 'Import Files',
    onSelect: () => {
      void runImport();
    },
  });

  rows.push({
    id: 'library-info',
    label: 'Library Info',
    chevron: true,
    onSelect: () => {
      pushLibraryInfo();
    },
  });

  rows.push({
    id: 'wheel-tick',
    label: 'Wheel Tick Size',
    chevron: true,
    onSelect: () => {
      pushWheelTick();
    },
  });

  rows.push({
    id: 'haptics',
    label: 'Haptics',
    chevron: true,
    onSelect: () => {
      pushHaptics();
    },
  });

  rows.push({
    id: 'min-length',
    label: 'Min Track Length',
    chevron: true,
    onSelect: () => {
      pushMinTrackLength();
    },
  });

  rows.push({
    id: 'reset-library',
    label: 'Reset Library',
    chevron: true,
    onSelect: () => {
      pushResetConfirm();
    },
  });

  return rows;
}

async function runScan(): Promise<void> {
  const store = useLibraryStore.getState();
  const provider = getPrimaryProvider();

  // Never scan silently: ask for permission first and surface the result.
  const permission = await store.requestPermission();
  if (permission !== 'granted') {
    useMenuStore.getState().push({
      id: 'perm-message',
      title: 'Access Needed',
      kind: 'message',
      items: permissionRows(),
    });
    return;
  }

  useMenuStore.getState().push({
    id: 'scan-progress',
    title: 'Updating',
    kind: 'progress',
    items: [],
    status: 'Starting',
  });

  const result = await store.scan(provider);

  // Pop the progress frame and report the outcome on the settings screen.
  // Guard: if the user pressed Menu mid-scan the progress frame is already
  // gone, and popping again would close the screen they are actually on.
  const top = useMenuStore.getState().stack.slice(-1)[0];
  if (top && top.id === 'scan-progress') {
    useMenuStore.getState().pop();
  }
  if (result) {
    useMenuStore.getState().setStatus(
      `${result.total} files, ${result.failed} failed, ${Math.round(result.ms / 100) / 10}s`,
    );
  } else {
    useMenuStore.getState().setStatus('Scan failed');
  }
}

async function runImport(): Promise<void> {
  const store = useLibraryStore.getState();

  useMenuStore.getState().push({
    id: 'import-progress',
    title: 'Importing',
    kind: 'progress',
    items: [],
    status: 'Choose files',
  });

  const result = await store.importFiles();

  const top = useMenuStore.getState().stack.slice(-1)[0];
  if (top && top.id === 'import-progress') {
    useMenuStore.getState().pop();
  }
  if (result) {
    useMenuStore.getState().setStatus(`Imported. ${result.total} files indexed`);
  } else {
    useMenuStore.getState().setStatus('Import cancelled');
  }
}

async function pushLibraryInfo(): Promise<void> {
  const { counts, lastResult, lastScanAt } = useLibraryStore.getState();
  const settings = await loadSettings();

  const lastScanText = lastScanAt
    ? new Date(lastScanAt).toLocaleString()
    : 'Never';

  // Which tag reader the last scan actually ran with. iOS has no native tag
  // reader (the Android-only module is never loaded there), so its tracks are
  // always tagged from the filename.
  const readerStatus = isAndroid
    ? hasNativeTagReader()
      ? 'Native'
      : 'Filename fallback'
    : 'Filename fallback (iOS)';

  // lastResult is the in-memory result of this session's scan; the persisted
  // setting covers a fresh launch.
  const fallbackTags = lastResult?.fallbackTags ?? settings.lastScanFallback;

  useMenuStore.getState().push({
    id: 'library-info',
    title: 'Library Info',
    kind: 'message',
    items: [
      { id: 'songs', label: 'Songs', sub: String(counts.tracks) },
      { id: 'artists', label: 'Artists', sub: String(counts.artists) },
      { id: 'albums', label: 'Albums', sub: String(counts.albums) },
      { id: 'reader', label: 'Tag reader', sub: readerStatus },
      {
        id: 'fallback',
        label: 'Fallback tags',
        sub: String(fallbackTags),
      },
      { id: 'last', label: 'Last scan', sub: lastScanText },
      {
        id: 'duration',
        label: 'Scan duration',
        sub: lastResult ? `${(lastResult.ms / 1000).toFixed(1)}s` : 'n/a',
      },
      {
        id: 'failures',
        label: 'Failed files',
        sub: String(lastResult?.failed ?? settings.lastScanFailed),
      },
    ],
  });
}

async function pushWheelTick(): Promise<void> {
  const settings = await loadSettings();
  const items: Row[] = [];

  for (let deg = WHEEL_TICK_MIN; deg <= WHEEL_TICK_MAX; deg += 1) {
    items.push({
      id: `tick-${deg}`,
      label: `${deg} degrees`,
      sub: deg === settings.wheelTickDeg ? 'Selected' : undefined,
      onSelect: () => {
        void (async () => {
          const applied = await setWheelTickDeg(deg);
          const settings = await loadSettings();
          useLibraryStore.getState().setSettings(settings);
          useMenuStore.getState().pop();
          useMenuStore.getState().setStatus(`Wheel tick: ${applied} degrees`);
        })();
      },
    });
  }

  useMenuStore.getState().push({
    id: 'wheel-tick',
    title: 'Wheel Tick Size',
    kind: 'settings',
    items,
    initialIndex: Math.max(0, settings.wheelTickDeg - WHEEL_TICK_MIN),
  });
}

async function pushHaptics(): Promise<void> {
  const settings = await loadSettings();
  const apply = (on: boolean) => {
    void (async () => {
      await persistHaptics(on);
      setHapticsEnabled(on);
      const settings = await loadSettings();
      useLibraryStore.getState().setSettings(settings);
      useMenuStore.getState().pop();
      useMenuStore.getState().setStatus(`Haptics ${on ? 'on' : 'off'}`);
    })();
  };

  useMenuStore.getState().push({
    id: 'haptics',
    title: 'Haptics',
    kind: 'settings',
    items: [
      { id: 'on', label: 'On', sub: settings.hapticsEnabled ? 'Selected' : undefined, onSelect: () => apply(true) },
      { id: 'off', label: 'Off', sub: !settings.hapticsEnabled ? 'Selected' : undefined, onSelect: () => apply(false) },
    ],
    initialIndex: settings.hapticsEnabled ? 0 : 1,
  });
}

async function pushMinTrackLength(): Promise<void> {
  const settings = await loadSettings();
  const items: Row[] = MIN_TRACK_LENGTH_CHOICES.map((ms) => ({
    id: `min-${ms}`,
    label: ms === 0 ? 'Off' : `${ms / 1000} seconds`,
    sub: ms === settings.minTrackLengthMs ? 'Selected' : undefined,
    onSelect: () => {
      void (async () => {
        await setMinTrackLengthMs(ms);
        const settings = await loadSettings();
        useLibraryStore.getState().setSettings(settings);
        useMenuStore.getState().pop();
        useMenuStore.getState().setStatus(
          ms === 0 ? 'Min length: off' : `Min length: ${ms / 1000}s`,
        );
      })();
    },
  }));

  const currentIndex = Math.max(
    0,
    MIN_TRACK_LENGTH_CHOICES.indexOf(
      settings.minTrackLengthMs as (typeof MIN_TRACK_LENGTH_CHOICES)[number],
    ),
  );

  useMenuStore.getState().push({
    id: 'min-length',
    title: 'Min Track Length',
    kind: 'settings',
    items,
    initialIndex: currentIndex,
  });
}

/**
 * iPod-style confirmation: the first row is the action, the second is Cancel.
 * Two rows only, so a stray Select cannot wipe the library.
 */
function pushResetConfirm(): void {
  useMenuStore.getState().push({
    id: 'reset-confirm',
    title: 'Reset Library?',
    kind: 'message',
    items: [
      {
        id: 'confirm',
        label: 'Reset Library',
        sub: 'Removes all indexed tracks',
        onSelect: () => {
          void (async () => {
            await useLibraryStore.getState().resetLibrary();
            useMenuStore.getState().popToRoot();
            useMenuStore.getState().setStatus('Library reset');
          })();
        },
      },
      {
        id: 'cancel',
        label: 'Cancel',
        onSelect: () => {
          useMenuStore.getState().pop();
        },
      },
    ],
    initialIndex: 1,
  });
}

// ---------------------------------------------------------------------------
// Music
// ---------------------------------------------------------------------------

function pushArtists(): void {
  useMenuStore.getState().push({
    id: 'artists',
    title: 'Artists',
    kind: 'list',
    loader: async () => {
      const artists = await getArtists();
      if (artists.length === 0) return [emptyLibraryRow()];
      return artists.map((a) => ({
        id: `artist:${a.name}`,
        label: a.name,
        sub: String(a.trackCount),
        chevron: true,
        onSelect: () => pushArtist(a.name),
      }));
    },
  });
}

function pushArtist(name: string): void {
  useMenuStore.getState().push({
    id: `artist:${name}`,
    title: name,
    kind: 'list',
    loader: async () => {
      const [albums, tracks] = await Promise.all([
        getAlbums({ artist: name }),
        getTracks({ artist: name }),
      ]);

      const rows: Row[] = [
        {
          id: 'all-songs',
          label: 'All Songs',
          sub: String(tracks.length),
          chevron: true,
          onSelect: () => {
            const ids = tracks.map((t) => t.id);
            useMenuStore.getState().push({
              id: `artist-songs:${name}`,
              title: 'All Songs',
              kind: 'list',
              items: trackRows(tracks, ids),
            });
          },
        },
      ];

      for (const album of albums) {
        rows.push({
          id: `album:${album.name}`,
          label: album.name,
          sub: String(album.trackCount),
          chevron: true,
          onSelect: () => pushAlbum(album.name, name),
        });
      }

      return rows;
    },
  });
}

function pushAlbums(): void {
  useMenuStore.getState().push({
    id: 'albums',
    title: 'Albums',
    kind: 'list',
    loader: async () => {
      const albums = await getAlbums();
      if (albums.length === 0) return [emptyLibraryRow()];
      return albums.map((a) => ({
        id: `album:${a.name}:${a.artist}`,
        label: a.name,
        sub: a.artist,
        chevron: true,
        onSelect: () => pushAlbum(a.name, a.artist),
      }));
    },
  });
}

function pushAlbum(album: string, artist: string): void {
  useMenuStore.getState().push({
    id: `album:${album}:${artist}`,
    title: album,
    kind: 'list',
    loader: async () => {
      const tracks = await getTracks({ album, artist });
      if (tracks.length === 0) return [emptyLibraryRow()];
      const ids = tracks.map((t) => t.id);
      return trackRows(tracks, ids);
    },
  });
}

function pushSongs(): void {
  useMenuStore.getState().push({
    id: 'songs',
    title: 'Songs',
    kind: 'list',
    loader: async () => {
      const tracks = await getTracks();
      if (tracks.length === 0) return [emptyLibraryRow()];
      // The queue for a song picked from the full list is that song alone;
      // expanding to the whole library is Phase 4's job.
      return tracks.map((t) => ({
        id: t.id,
        label: t.title,
        sub: t.artist,
        onSelect: () => {
          void playTrackById(t.id);
        },
      }));
    },
  });
}

function pushPlaylists(): void {
  useMenuStore.getState().push({
    id: 'playlists',
    title: 'Playlists',
    kind: 'message',
    items: [{ id: 'none', label: 'No playlists yet' }],
  });
}

function pushMusic(): void {
  useMenuStore.getState().push({
    id: 'music',
    title: 'Music',
    kind: 'menu',
    items: [
      { id: 'playlists', label: 'Playlists', chevron: true, onSelect: pushPlaylists },
      { id: 'artists', label: 'Artists', chevron: true, onSelect: pushArtists },
      { id: 'albums', label: 'Albums', chevron: true, onSelect: pushAlbums },
      { id: 'songs', label: 'Songs', chevron: true, onSelect: pushSongs },
    ],
  });
}

function pushSettings(): void {
  useMenuStore.getState().push({
    id: 'settings',
    title: 'Settings',
    kind: 'menu',
    items: settingsRows(),
  });
}

async function pushAbout(): Promise<void> {
  const tracks = await countTracks();
  useMenuStore.getState().push({
    id: 'about',
    title: 'About',
    kind: 'message',
    items: [
      { id: 'name', label: 'iPod Player' },
      { id: 'version', label: 'Version', sub: '1.0.0' },
      { id: 'tracks', label: 'Tracks', sub: String(tracks) },
    ],
  });
}

async function shuffleSongs(): Promise<void> {
  const ids = await getAllTrackIds();
  if (ids.length === 0) {
    useMenuStore.getState().setStatus('No music');
    return;
  }
  await shuffleAndPlay(ids);
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export function buildRootItems(): Row[] {
  return [
    { id: 'music', label: 'Music', chevron: true, onSelect: pushMusic },
    {
      id: 'shuffle',
      label: 'Shuffle Songs',
      onSelect: () => {
        void shuffleSongs();
      },
    },
    { id: 'settings', label: 'Settings', chevron: true, onSelect: pushSettings },
    {
      id: 'about',
      label: 'About',
      chevron: true,
      onSelect: () => {
        void pushAbout();
      },
    },
  ];
}

/**
 * First-run offer. Shown once on Android when the index is empty: the user
 * chooses to grant access and scan, rather than the app scanning silently.
 */
export function offerFirstRun(): void {
  useMenuStore.getState().push({
    id: 'first-run',
    title: 'Welcome',
    kind: 'message',
    items: [
      {
        id: 'scan',
        label: 'Load Music',
        sub: 'Scan this device',
        onSelect: () => {
          void (async () => {
            useMenuStore.getState().pop();
            await runScan();
          })();
        },
      },
      {
        id: 'later',
        label: 'Not Now',
        onSelect: () => {
          useMenuStore.getState().pop();
        },
      },
    ],
  });
}

/** Installs the main menu as the root frame. */
export function initMenus(): void {
  useMenuStore.getState().reset({
    id: 'root',
    title: 'iPod',
    kind: 'menu',
    items: buildRootItems(),
  });
}

/** Pushes the now-playing frame. Called by the player stub. */
export function pushNowPlaying(track: Track | null): void {
  if (!track) return;

  const stack = useMenuStore.getState().stack;
  const top = stack[stack.length - 1];

  // Replace an existing now-playing frame rather than stacking duplicates.
  if (top && top.kind === 'nowplaying') {
    useMenuStore.getState().replaceTopItems([
      { id: 'title', label: track.title },
      { id: 'artist', label: track.artist },
      { id: 'album', label: track.album },
    ]);
    return;
  }

  useMenuStore.getState().push({
    id: 'nowplaying',
    title: 'Now Playing',
    kind: 'nowplaying',
    items: [
      { id: 'title', label: track.title },
      { id: 'artist', label: track.artist },
      { id: 'album', label: track.album },
    ],
  });
}

/** Fetches full rows for a bounded queue (album or artist). */
export async function loadQueue(ids: string[]): Promise<Track[]> {
  return getTracksByIds(ids);
}
