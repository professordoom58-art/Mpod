/**
 * Dynamic config layer.
 *
 * app.json stays the single source of truth. This file exists only so CI can
 * stamp build numbers without editing tracked files:
 *
 *   VERSION_CODE=<n> npx expo prebuild ...
 *
 * When VERSION_CODE is absent or invalid the app.json values are used as-is.
 * Nothing else is overridden.
 */

import type { ConfigContext, ExpoConfig } from 'expo/config';

const FALLBACK_VERSION_CODE = 1;

function parseVersionCode(raw: string | undefined): number {
  if (!raw) return FALLBACK_VERSION_CODE;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return FALLBACK_VERSION_CODE;
  return parsed;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const versionCode = parseVersionCode(process.env.VERSION_CODE);

  return {
    ...config,
    android: {
      ...config.android,
      versionCode,
    },
    ios: {
      ...config.ios,
      buildNumber: String(versionCode),
    },
  } as ExpoConfig;
};
