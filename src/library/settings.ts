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

export const SETTING_KEYS = {
  wheelTickDeg: 'wheel.tickDeg',
  hapticsEnabled: 'haptics.enabled',
  minTrackLengthMs: 'scan.minTrackLengthMs',
  lastScanAt: 'scan.lastScanAt',
  lastScanMs: 'scan.lastScanMs',
  lastScanFailed: 'scan.lastScanFailed',
  lastScanFallback: 'scan.lastScanFallback',
} as const;

export const DEFAULTS = {
  wheelTickDeg: 15,
  hapticsEnabled: true,
  minTrackLengthMs: 30000,
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
  ] = await Promise.all([
    getSettingNumber(SETTING_KEYS.wheelTickDeg, DEFAULTS.wheelTickDeg),
    getSettingBool(SETTING_KEYS.hapticsEnabled, DEFAULTS.hapticsEnabled),
    getSettingNumber(SETTING_KEYS.minTrackLengthMs, DEFAULTS.minTrackLengthMs),
    getSettingNumber(SETTING_KEYS.lastScanAt, 0),
    getSettingNumber(SETTING_KEYS.lastScanMs, 0),
    getSettingNumber(SETTING_KEYS.lastScanFailed, 0),
    getSettingNumber(SETTING_KEYS.lastScanFallback, 0),
  ]);

  return {
    wheelTickDeg: clampTickDeg(wheelTickDeg),
    hapticsEnabled,
    minTrackLengthMs,
    lastScanAt,
    lastScanMs,
    lastScanFailed,
    lastScanFallback,
  };
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
