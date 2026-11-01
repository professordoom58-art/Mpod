/**
 * Typed settings accessor over the `settings` table in the library DB.
 * No extra dependency, no AsyncStorage.
 */

import {
  getSetting,
  getSettingBool,
  getSettingNumber,
  setSetting,
  setSettingBool,
} from './db';
import {
  DEFAULT_THEME_ID,
  isThemeId,
  type ThemeId,
  type ThemeOverrides,
} from '../ui/theme';

export const SETTING_KEYS = {
  wheelTickDeg: 'wheel.tickDeg',
  hapticsEnabled: 'haptics.enabled',
  minTrackLengthMs: 'scan.minTrackLengthMs',
  lastScanAt: 'scan.lastScanAt',
  lastScanMs: 'scan.lastScanMs',
  lastScanFailed: 'scan.lastScanFailed',
  lastScanFallback: 'scan.lastScanFallback',
  themeId: 'ui.theme',
  themeCustom: 'ui.themeCustom',
  lastTrackId: 'player.lastTrackId',
  lastPositionMs: 'player.lastPositionMs',
} as const;

export const DEFAULTS = {
  wheelTickDeg: 15,
  hapticsEnabled: true,
  minTrackLengthMs: 30000,
  themeId: DEFAULT_THEME_ID,
} as const;

export const WHEEL_TICK_MIN = 10;
export const WHEEL_TICK_MAX = 25;

/** Options offered by Settings > Min Track Length. */
export const MIN_TRACK_LENGTH_CHOICES = [0, 30000, 60000] as const;

export type Settings = {
  wheelTickDeg: number;
  hapticsEnabled: boolean;
  minTrackLengthMs: number;
  lastScanAt: number;
  lastScanMs: number;
  lastScanFailed: number;
  lastScanFallback: number;
  /** Selected built-in theme preset. */
  themeId: ThemeId;
  /** Per-field overrides for the "Custom Colors" mode, or null when off. */
  customTheme: ThemeOverrides | null;
};

export async function loadSettings(): Promise<Settings> {
  const [
    wheelTickDeg,
    hapticsEnabled,
    minTrackLengthMs,
    lastScanAt,
    lastScanMs,
    lastScanFailed,
    lastScanFallback,
    themeIdRaw,
    themeCustomRaw,
  ] = await Promise.all([
    getSettingNumber(SETTING_KEYS.wheelTickDeg, DEFAULTS.wheelTickDeg),
    getSettingBool(SETTING_KEYS.hapticsEnabled, DEFAULTS.hapticsEnabled),
    getSettingNumber(SETTING_KEYS.minTrackLengthMs, DEFAULTS.minTrackLengthMs),
    getSettingNumber(SETTING_KEYS.lastScanAt, 0),
    getSettingNumber(SETTING_KEYS.lastScanMs, 0),
    getSettingNumber(SETTING_KEYS.lastScanFailed, 0),
    getSettingNumber(SETTING_KEYS.lastScanFallback, 0),
    getSetting(SETTING_KEYS.themeId),
    getSetting(SETTING_KEYS.themeCustom),
  ]);

  return {
    wheelTickDeg: clampTickDeg(wheelTickDeg),
    hapticsEnabled,
    minTrackLengthMs,
    lastScanAt,
    lastScanMs,
    lastScanFailed,
    lastScanFallback,
    themeId: isThemeId(themeIdRaw) ? themeIdRaw : DEFAULTS.themeId,
    customTheme: parseThemeOverrides(themeCustomRaw),
  };
}

/** Parses persisted custom-theme JSON; a corrupt value means "no overrides". */
function parseThemeOverrides(raw: string | null): ThemeOverrides | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as ThemeOverrides;
    }
  } catch {
    /* fall through to null */
  }
  return null;
}

export function clampTickDeg(value: number): number {
  if (!Number.isFinite(value)) return DEFAULTS.wheelTickDeg;
  return Math.min(WHEEL_TICK_MAX, Math.max(WHEEL_TICK_MIN, Math.round(value)));
}

export async function setWheelTickDeg(value: number): Promise<number> {
  const clamped = clampTickDeg(value);
  await setSetting(SETTING_KEYS.wheelTickDeg, String(clamped));
  return clamped;
}

export async function setHapticsEnabled(value: boolean): Promise<void> {
  await setSettingBool(SETTING_KEYS.hapticsEnabled, value);
}

export async function setMinTrackLengthMs(value: number): Promise<void> {
  await setSetting(SETTING_KEYS.minTrackLengthMs, String(value));
}

export async function recordScan(result: {
  ms: number;
  failed: number;
  fallbackTags?: number;
}): Promise<void> {
  await Promise.all([
    setSetting(SETTING_KEYS.lastScanAt, String(Date.now())),
    setSetting(SETTING_KEYS.lastScanMs, String(Math.round(result.ms))),
    setSetting(SETTING_KEYS.lastScanFailed, String(result.failed)),
    setSetting(SETTING_KEYS.lastScanFallback, String(result.fallbackTags ?? 0)),
  ]);
}

export async function readMinTrackLengthMs(): Promise<number> {
  return getSettingNumber(SETTING_KEYS.minTrackLengthMs, DEFAULTS.minTrackLengthMs);
}

export async function readRaw(key: string): Promise<string | null> {
  return getSetting(key);
}

export async function setThemeId(value: ThemeId): Promise<void> {
  await setSetting(SETTING_KEYS.themeId, value);
}

/** Writes the custom overrides, or clears them when null. */
export async function setThemeOverrides(value: ThemeOverrides | null): Promise<void> {
  await setSetting(SETTING_KEYS.themeCustom, value ? JSON.stringify(value) : '');
}

/**
 * Session resume. Written on pause and ~every 5s while playing, read once at
 * boot. Kept here so the player never touches the DB directly.
 */
export async function savePlaybackSession(
  trackId: string | null,
  positionMs: number,
): Promise<void> {
  await Promise.all([
    setSetting(SETTING_KEYS.lastTrackId, trackId ?? ''),
    setSetting(SETTING_KEYS.lastPositionMs, String(Math.max(0, Math.round(positionMs)))),
  ]);
}

export async function loadPlaybackSession(): Promise<{
  trackId: string | null;
  positionMs: number;
}> {
  const [trackId, positionMs] = await Promise.all([
    getSetting(SETTING_KEYS.lastTrackId),
    getSettingNumber(SETTING_KEYS.lastPositionMs, 0),
  ]);
  return { trackId: trackId && trackId.length > 0 ? trackId : null, positionMs };
}
