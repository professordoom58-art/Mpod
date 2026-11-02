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
  NOW_PLAYING_LAYOUTS,
  WHEEL_TICK_MAX,
  WHEEL_TICK_MIN,
  loadPlaybackSession,
  loadSettings,
  setGlassReflection,
  setHapticsEnabled as persistHaptics,
  setMinTrackLengthMs,
  setNowPlayingLayout,
  setThemeId,
  setThemeOverrides,
  setWheelTickDeg,
  type Settings,
} from '../library/settings';
import { useLibraryStore } from '../library/store';
import type { Track } from '../library/types';
import { setHapticsEnabled } from '../haptics/haptics';
import {
  requestPlayByIds,
  shuffleAndPlay,
} from '../player/playback';
import { usePlayerStore } from '../player/store';
import {
  COLOR_SWATCHES,
  GRADIENT_SWATCHES,
  THEME_FIELDS,
  THEME_ORDER,
  resolveAppTheme,
  themePresets,
  type AppThemeConfig,
  type ScreenGradient,
  type ThemeField,
  type ThemeOverrides,
} from '../ui/theme';
import { useMenuStore, type Row } from './menuStack';

const isAndroid = Platform.OS === 'android';

/**
 * Runs an async action started from a tap without leaving a floating promise.
 *
 * Every menu row's onSelect is synchronous, so async work is necessarily
 * fire-and-forget. `void promise` alone turns a DB or Linking failure into an
 * unhandled rejection; this logs it instead and keeps the app alive.
 */
function fireAndForget(p: Promise<unknown>): void {
  void p.catch((e) => {
    console.error('[nav] action failed', e);
  });
}

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
          fireAndForget(useLibraryStore.getState().requestPermission());
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
          fireAndForget(Linking.openSettings());
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
      fireAndForget(requestPlayByIds(queueIds, i));
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
        fireAndForget(runScan());
      },
    });
  }

  rows.push({
    id: 'import-files',
    label: 'Import Files',
    onSelect: () => {
      fireAndForget(runImport());
    },
  });

  rows.push({
    id: 'library-info',
    label: 'Library Info',
    chevron: true,
    onSelect: () => {
      fireAndForget(pushLibraryInfo());
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
    id: 'themes',
    label: 'Themes',
    chevron: true,
    sub: activeThemeLabel(),
    onSelect: () => {
      fireAndForget(pushThemes());
    },
  });

  rows.push({
    id: 'glass-reflection',
    label: 'Glass Reflection',
    chevron: true,
    sub: glassReflectionLabel(),
    onSelect: () => {
      pushGlassReflection();
    },
  });

  rows.push({
    id: 'now-playing-style',
    label: 'Now Playing Style',
    chevron: true,
    sub: nowPlayingLayoutLabel(),
    onSelect: () => {
      pushNowPlayingStyle();
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
      sub: deg === settings.wheelTickDeg ? 'Selected' : undefined,        onSelect: () => {
          fireAndForget(
            (async () => {
              const applied = await setWheelTickDeg(deg);
              const settings = await loadSettings();
              useLibraryStore.getState().setSettings(settings);
              useMenuStore.getState().pop();
              useMenuStore.getState().setStatus(`Wheel tick: ${applied} degrees`);
            })(),
          );
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
    fireAndForget(
      (async () => {
        await persistHaptics(on);
        setHapticsEnabled(on);
        const settings = await loadSettings();
        useLibraryStore.getState().setSettings(settings);
        useMenuStore.getState().pop();
        useMenuStore.getState().setStatus(`Haptics ${on ? 'on' : 'off'}`);
      })(),
    );
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

/** On/Off summary for the Settings frame's Glass Reflection row. */
function glassReflectionLabel(): string {
  return useLibraryStore.getState().settings?.glassReflection ?? true
    ? 'On'
    : 'Off';
}

/** Friendly name of the active Now Playing design. */
function nowPlayingLayoutLabel(): string {
  const current = useLibraryStore.getState().settings?.nowPlayingLayout ?? 'split';
  const found = NOW_PLAYING_LAYOUTS.find((option) => option.value === current);
  return found ? found.label : 'Modern Split';
}

/** Settings > Glass Reflection. Toggles the diagonal LCD sheen live. */
async function pushGlassReflection(): Promise<void> {
  const settings = await loadSettings();
  const apply = (on: boolean) => {
    fireAndForget(
      (async () => {
        await setGlassReflection(on);
        useLibraryStore.getState().setSettings(await loadSettings());
        useMenuStore.getState().pop();
        refreshSettingsFrame();
        useMenuStore.getState().setStatus(`Glass reflection ${on ? 'on' : 'off'}`);
      })(),
    );
  };

  useMenuStore.getState().push({
    id: 'glass-reflection',
    title: 'Glass Reflection',
    kind: 'settings',
    items: [
      {
        id: 'on',
        label: 'On',
        sub: settings.glassReflection ? 'Selected' : undefined,
        onSelect: () => apply(true),
      },
      {
        id: 'off',
        label: 'Off',
        sub: !settings.glassReflection ? 'Selected' : undefined,
        onSelect: () => apply(false),
      },
    ],
    initialIndex: settings.glassReflection ? 0 : 1,
  });
}

/** Settings > Now Playing Style. Applies on the next Now Playing render. */
async function pushNowPlayingStyle(): Promise<void> {
  const settings = await loadSettings();
  const items: Row[] = NOW_PLAYING_LAYOUTS.map((option) => ({
    id: `np-${option.value}`,
    label: option.label,
    sub: settings.nowPlayingLayout === option.value ? 'Selected' : undefined,
    onSelect: () => {
      fireAndForget(
        (async () => {
          await setNowPlayingLayout(option.value);
          useLibraryStore.getState().setSettings(await loadSettings());
          useMenuStore.getState().pop();
          refreshSettingsFrame();
          useMenuStore.getState().setStatus(`Now Playing: ${option.label}`);
        })(),
      );
    },
  }));

  useMenuStore.getState().push({
    id: 'now-playing-style',
    title: 'Now Playing Style',
    kind: 'settings',
    items,
    initialIndex: Math.max(
      0,
      NOW_PLAYING_LAYOUTS.findIndex((o) => o.value === settings.nowPlayingLayout),
    ),
  });
}

/** Short label for the Settings row: the active preset, or "Custom". */
function activeThemeLabel(): string {
  const settings = useLibraryStore.getState().settings;
  return resolveAppTheme(settings?.themeId, settings?.customTheme).label;
}

/** Human label for a field's current value (swatch name, or "Custom"). */
function themeFieldValueLabel(resolved: AppThemeConfig, key: ThemeField): string {
  const value = resolved[key];
  if (key === 'screenBgGradient') {
    const grad = value as ScreenGradient;
    const found = GRADIENT_SWATCHES.find(
      (g) => g.value.join('|').toLowerCase() === grad.join('|').toLowerCase(),
    );
    return found ? found.label : 'Custom';
  }
  const found = COLOR_SWATCHES.find(
    (c) => c.value.toLowerCase() === String(value).toLowerCase(),
  );
  return found ? found.label : 'Custom';
}

/**
 * Builds the Themes submenu rows from the current settings. Presets set the
 * whole palette; "Custom Colors" toggles per-field overrides that cycle through
 * swatches on Select (no color picker needed).
 */
function buildThemeRows(s: Settings): Row[] {
  const resolved = resolveAppTheme(s.themeId, s.customTheme);
  const custom = s.customTheme != null;

  const rows: Row[] = THEME_ORDER.map((id) => ({
    id: `theme-${id}`,
    label: themePresets[id].label,
    sub: !custom && s.themeId === id ? 'Selected' : undefined,
    onSelect: () => {
      fireAndForget(
        (async () => {
          await setThemeId(id);
          await setThemeOverrides(null);
          useLibraryStore.getState().setSettings(await loadSettings());
          useMenuStore.getState().pop();
          // Settings is the top frame again: rebuild it so its "Themes" row
          // names the preset that was just applied.
          refreshSettingsFrame();
          useMenuStore.getState().setStatus(`Theme: ${themePresets[id].label}`);
        })(),
      );
    },
  }));

  rows.push({
    id: 'theme-custom',
    label: 'Custom Colors',
    sub: custom ? 'On' : 'Off',
    onSelect: () => {
      fireAndForget(
        (async () => {
          const current = await loadSettings();
          if (current.customTheme) {
            await setThemeOverrides(null);
          } else {
            // Seed overrides from the resolved preset so cycling starts from
            // the exact look currently on screen.
            const seed = resolveAppTheme(current.themeId, null);
            await setThemeOverrides({
              shellColor: seed.shellColor,
              wheelColor: seed.wheelColor,
              wheelTextColor: seed.wheelTextColor,
              screenBgGradient: seed.screenBgGradient,
              accentColor: seed.accentColor,
            });
          }
          useLibraryStore.getState().setSettings(await loadSettings());
          refreshThemesFrame();
          refreshSettingsFrame();
        })(),
      );
    },
  });

  if (custom) {
    for (const field of THEME_FIELDS) {
      rows.push({
        id: `theme-field-${field.key}`,
        label: field.label,
        sub: themeFieldValueLabel(resolved, field.key),
        onSelect: () => {
          fireAndForget(cycleThemeField(field.key));
        },
      });
    }
  }

  return rows;
}

/** Advances one custom field to the next swatch and repaints live. */
async function cycleThemeField(field: ThemeField): Promise<void> {
  const s = await loadSettings();
  const resolved = resolveAppTheme(s.themeId, s.customTheme);
  const next: ThemeOverrides = { ...(s.customTheme ?? {}) };

  if (field === 'screenBgGradient') {
    const key = resolved.screenBgGradient.join('|').toLowerCase();
    const i = GRADIENT_SWATCHES.findIndex((g) => g.value.join('|').toLowerCase() === key);
    const pick = GRADIENT_SWATCHES[(i + 1) % GRADIENT_SWATCHES.length];
    // Keep the swatch's stop count (Warm Matte is a three-stop gradient).
    next.screenBgGradient = pick.value;
  } else {
    const colorField = field as Exclude<ThemeField, 'screenBgGradient'>;
    const cur = resolved[colorField].toLowerCase();
    const i = COLOR_SWATCHES.findIndex((c) => c.value.toLowerCase() === cur);
    next[colorField] = COLOR_SWATCHES[(i + 1) % COLOR_SWATCHES.length].value;
  }

  await setThemeOverrides(next);
  useLibraryStore.getState().setSettings(await loadSettings());
  refreshThemesFrame();
  refreshSettingsFrame();
}

/**
 * Rebuilds the Settings frame in place when it is in the stack, so its summary
 * labels (the Themes row's active-preset subtitle) never go stale after a
 * change made on a child screen.
 */
function refreshSettingsFrame(): void {
  const stack = useMenuStore.getState().stack;
  if (!stack.some((frame) => frame.id === 'settings')) return;
  useMenuStore.getState().updateFrameItems('settings', settingsRows());
}

/** Rebuilds the top frame in place when it is the Themes screen. */
function refreshThemesFrame(): void {
  fireAndForget(
    (async () => {
      const stack = useMenuStore.getState().stack;
      const top = stack[stack.length - 1];
      if (top?.id === 'themes') {
        useMenuStore.getState().replaceTopItems(buildThemeRows(await loadSettings()));
      }
    })(),
  );
}

/** Settings > Themes. Persisted and applied live via the library store. */
async function pushThemes(): Promise<void> {
  const settings = await loadSettings();
  useMenuStore.getState().push({
    id: 'themes',
    title: 'Themes',
    kind: 'settings',
    items: buildThemeRows(settings),
    initialIndex: Math.max(0, THEME_ORDER.indexOf(settings.themeId)),
  });
}

async function pushMinTrackLength(): Promise<void> {
  const settings = await loadSettings();
  const items: Row[] = MIN_TRACK_LENGTH_CHOICES.map((ms) => ({
    id: `min-${ms}`,
    label: ms === 0 ? 'Off' : `${ms / 1000} seconds`,
    sub: ms === settings.minTrackLengthMs ? 'Selected' : undefined,
    onSelect: () => {
      fireAndForget(
        (async () => {
          await setMinTrackLengthMs(ms);
          const settings = await loadSettings();
          useLibraryStore.getState().setSettings(settings);
          useMenuStore.getState().pop();
          useMenuStore.getState().setStatus(
            ms === 0 ? 'Min length: off' : `Min length: ${ms / 1000}s`,
          );
        })(),
      );
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
          fireAndForget(
            (async () => {
              await useLibraryStore.getState().resetLibrary();
              useMenuStore.getState().popToRoot();
              useMenuStore.getState().setStatus('Library reset');
            })(),
          );
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
    title: 'Cover Flow',
    kind: 'coverflow',
    loader: async () => {
      const albums = await getAlbums();
      if (albums.length === 0) return [emptyLibraryRow()];
      return albums.map((a) => ({
        id: `album:${a.name}:${a.artist}`,
        label: a.name,
        sub: a.artist,
        artworkPath: a.artworkPath,
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
      // Picking a song queues the whole list from that point, like the real
      // device, instead of a one-track queue.
      const ids = tracks.map((t) => t.id);
      return trackRows(tracks, ids);
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
      { id: 'albums', label: 'Cover Flow', chevron: true, onSelect: pushAlbums },
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
  const rows: Row[] = [];

  // Restored from a previous session: surface it at the top of the main menu,
  // like a real iPod, so Play can resume and the screen can be reopened.
  const current = usePlayerStore.getState().current;
  if (current) {
    rows.push({
      id: 'now-playing',
      label: 'Now Playing',
      sub: current.title,
      chevron: true,
      onSelect: () => pushNowPlaying(current),
    });
  }

  rows.push(
    { id: 'music', label: 'Music', chevron: true, onSelect: pushMusic },
    {
      id: 'shuffle',
      label: 'Shuffle Songs',        onSelect: () => {
          fireAndForget(shuffleSongs());
        },
    },
    { id: 'settings', label: 'Settings', chevron: true, onSelect: pushSettings },
    {
      id: 'about',
      label: 'About',
      chevron: true,
      onSelect: () => {
        fireAndForget(pushAbout());
      },
    },
  );

  return rows;
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
          fireAndForget(
            (async () => {
              useMenuStore.getState().pop();
              await runScan();
            })(),
          );
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

/**
 * Rebuilds the root rows in place. Used after a session restore, because the
 * "Now Playing" row only exists once a track is loaded.
 */
export function refreshRootMenu(): void {
  if (useMenuStore.getState().stack.length === 0) return;
  useMenuStore.getState().replaceRootItems(buildRootItems());
}

/**
 * Cold-boot resume. Restores the last track paused at its saved position and
 * never starts audio; togglePlay() loads and seeks on the first press.
 */
export async function resumeLastSession(): Promise<void> {
  if (usePlayerStore.getState().current) return;

  try {
    const { trackId, positionMs } = await loadPlaybackSession();
    if (!trackId) return;

    const [track] = await getTracksByIds([trackId]);
    if (!track) return;

    usePlayerStore.getState().restoreSession(track, positionMs);
    refreshRootMenu();
  } catch (e) {
    console.error('[nav] session resume failed', e);
  }
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

/**
 * Cover Flow Select: flip the highlighted album open into its tracklist card.
 * The card opens immediately (loading), then fills with the album's tracks.
 * Called from the wheel wiring, which owns the Cover Flow select behaviour.
 */
export async function openAlbumOverlay(): Promise<void> {
  const menu = useMenuStore.getState();
  const top = menu.stack[menu.stack.length - 1];
  if (!top || top.kind !== 'coverflow' || top.albumOverlay) return;

  const row = top.items[top.selectedIndex];
  if (!row) return;

  menu.openAlbumOverlay({
    sourceId: row.id,
    title: row.label,
    sub: row.sub,
    artworkPath: row.artworkPath,
  });

  const tracks = await getTracks({ album: row.label, artist: row.sub });
  if (tracks.length === 0) {
    useMenuStore.getState().setAlbumOverlayItems(row.id, [
      { id: 'empty-album', label: 'No tracks' },
    ]);
    return;
  }

  const ids = tracks.map((t) => t.id);
  useMenuStore.getState().setAlbumOverlayItems(row.id, trackRows(tracks, ids));
}

/** Fetches full rows for a bounded queue (album or artist). */
export async function loadQueue(ids: string[]): Promise<Track[]> {
  return getTracksByIds(ids);
}
