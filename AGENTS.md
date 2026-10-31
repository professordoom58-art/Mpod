# AGENTS.md — iPod Player (project context for coding agents)

Snapshot date: 2026-10-31. This file is a handoff snapshot. **The repository is the source of truth**: if code, `package.json`, or `app.json` disagree with this file, trust the repo and update this file. Items marked **UNVERIFIED** were reported by a previous agent or planned but not confirmed by running them. Items marked **CONFIRM** are proposed defaults the owner has not approved.

---

## 1. What this project is

A music player app with an **iPod-classic user interface**: a drawn iPod body, a 4:3 LCD screen with a hierarchical menu, and a **touch click wheel** that scrolls lists by rotating a finger around a ring, with **haptic feedback** on every step. Plays the user's own local music files (no streaming service).

- Build **Android first**, then port to **iPhone 13**. Cross-platform code (Expo / React Native / TypeScript) is the strategy that makes the port cheap. Do not write Android-only native code (Kotlin/Java) or iOS-only native code unless the owner approves.
- Visual reference: Figma community file "figPod - An iPod inside Figma". It could not be fetched by automated tools (Figma blocks it). The owner must duplicate it into their own drafts and provide exports (SVG/PNG), a screenshot set, or an API token/MCP access. Until then all geometry/colors live in `src/ui/theme.ts` as named constants so the real design can be dropped in without logic changes.

## 2. Owner and collaboration

- Single developer on a Windows laptop, using the Antigravity IDE plus other AI agents (DeepSeek among them) for code generation. Agents hand work to each other through prompts and this file.
- Prefers **dense, information-complete, technically exhaustive** answers over diplomatic framing. State uncertainty plainly instead of guessing.
- Paste-friendly output: complete files with full paths, exact PowerShell commands, a verification checklist after every change, then stop and wait.

## 3. Environment (facts that cause real failures)

| Item | Value |
|---|---|
| OS / shell | Windows 11, PowerShell (not bash) |
| Project root | `C:\Users\sutha\Documents\ipod-player` |
| Mac available | **No.** iOS builds only via cloud/CI |
| JDK | Temurin 17 (`JAVA_HOME` set; value ends with a trailing backslash, remove it if Gradle complains) |
| Android SDK | `%LOCALAPPDATA%\Android\Sdk` (adb and emulator exist). `ANDROID_HOME` and PATH entries were **missing** initially and were being added; VS Code must be fully restarted after persistent env changes |
| Android test device | Physical Android phone via USB debugging (being connected). Emulator has **no haptics**, so haptic feel can only be judged on a real phone |
| iPhone | iPhone 13 with **SideStore** and **LiveContainer** already set up (free Apple ID; no $99 developer account) |
| npm policy | The user-level `.npmrc` has an allow-scripts policy that **blocks `npx expo install`**. Use `npm install <pkg>@<exact version>` instead |
| Lint | ESLint is **not installed**; `npx expo lint` tries to install it and fails under the policy. Use `tsc --noEmit --noUnusedLocals --noUnusedParameters` |
| Path caveats | `Documents` may be OneDrive-redirected (can lock `node_modules`/`android/build`; check with `(Get-Item $HOME\Documents).FullName`). Native Android builds can hit the 260-character path limit; enable Windows long paths and `git config --global core.longpaths true` if "Filename longer than 260 characters" appears |
| Antivirus | Defender scanning slows Gradle badly; optional exclusions for the project, `~\.gradle`, and the SDK folder |
| First Gradle build | Slow (10–25 min). After it, JS edits hot-reload via Metro with no rebuild. Rebuild only after native dependency / `app.json` plugin changes |

## 4. Stack and versions

Versions below were **reported by the Phase 2–3 agent from `package.json`/`node_modules` (re-verify)**:

expo ~58.0.21 · react-native 0.88.1 · react-native-reanimated ^4.7.1 (needs `react-native-worklets` and its Babel plugin) · react-native-gesture-handler · react-native-svg · react-native-safe-area-context · expo-sqlite ~58.0.14 · expo-media-library ~58.0.13 · expo-document-picker ~58.0.4 · expo-file-system ~58.0.13 · expo-haptics ~58.0.7 · expo-dev-client · expo-audio 58.0.10 (Phase 4: implemented, API verified against installed .d.ts) · zustand ^5.0.16 · @missingcore/react-native-metadata-retriever 3.2.1 (**Android-only**) · TypeScript strict.

SDK 58 API changes the previous agent found and built around (**UNVERIFIED at runtime**):
- `expo-media-library`: legacy `getAssetsAsync` is deprecated and throws. Use the new `Query` API: `new Query().eq(AssetField.MEDIA_TYPE, MediaType.AUDIO).orderBy(...).limit(500).offset(n).exeForMetadata()`. Permission: `requestPermissionsAsync(false, ['audio'])`, mapped to `granted | denied | blocked`.
- `expo-file-system`: use the new `File` / `Directory` / `Paths` API. Legacy API is deprecated.
- `expo-sqlite`: async API (`openDatabaseAsync`, `execAsync`, `runAsync`, `getAllAsync`, `getFirstAsync`, `withTransactionAsync`).

Always verify an API in the installed typings before using it. Never write a library call from memory.

## 5. Architecture and hard rules

```
src/
  wheel/        ClickWheel.tsx, useClickWheel.ts
  haptics/      haptics.ts          // ONLY file allowed to import expo-haptics
  library/      types.ts, sortKey.ts, fnv.ts, db.ts, resolveUri.ts, metadata.ts,
                androidMediaStore.ts (ONLY library file with Platform branching, plus the guarded import in metadata.ts),
                importedFiles.ts, indexer.ts, store.ts, providers.ts, devSeed.ts (__DEV__ only)
  player/       engine.ts (interface), store.ts (real, backed by engine), expoAudio.ts (the only expo-audio import), playback.ts (queue bridge)
  ui/           Screen.tsx, MenuList.tsx, ProgressView.tsx, NowPlaying.tsx, windowing.ts, theme.ts
  nav/          menuStack.ts        // custom zustand stack, NOT react-navigation
scripts/check-pure.ts               // pure-function checks, run with tsx
```

Rules:
1. **Platform branches only** in `haptics/haptics.ts`, `library/androidMediaStore.ts`, and the guarded lazy import in `library/metadata.ts`. Everything else stays platform-agnostic.
2. UI talks to `PlayerEngine` and `LibraryProvider`/store interfaces, never to `expo-audio` or `expo-media-library` directly.
3. Keep public signatures and file paths stable unless the owner approves a change.
4. Imported files and artwork are stored as **paths relative to the document directory**, never absolute `file://` paths (iOS container paths change across updates and re-signing). Resolve at runtime with `resolveUri.ts`.
5. Subscribe to state with **selectors** so a wheel step re-renders only the list, not the app.
6. Complete files only (no "rest unchanged"). No new native dependency without asking.
7. Do not commit, push, tag, or change git history unless asked. Do not print or request secrets.
8. Before running `expo prebuild`, `expo run:*`, `gradlew`, or killing node/java/adb, ask whether a local build or device session is active.
9. Label anything not proven by actually running it as UNVERIFIED.

## 6. Feature specification (as implemented or specified)

### Click wheel (`useClickWheel.ts`)
- Rotation by angle accumulation on the UI thread (Reanimated worklets): `theta = atan2(y - cy, x - cx)`; delta wrapped to (−π, π]; accumulate; emit one step per `tickDeg` (default 15°, user setting 10–25°); clockwise = +1 (y-down coordinates). Touches inside the center radius (`innerRatio` default 0.36) or outside the ring do not rotate.
- Pan `minDistance(4)`, Tap `maxDistance(8)`, composed with `Gesture.Race`. Tap zones are 45° angular sectors computed from geometry: top = Menu, right = Next, bottom = Play/Pause, left = Prev, center = Select. Only `onStep` and `onTap` cross to JS via `runOnJS`.
- Menu long-press = back to main menu (proposed; only if it composes cleanly with the Race).
- Do not rewrite the algorithm unless explaining the bug it fixes.

### Haptics (`haptics.ts`)
- `tick()` rate-limited to ≥25 ms. Android: `performAndroidHapticsAsync(AndroidHaptics.Clock_Tick)`; iOS: `selectionAsync()`.
- `click()`: Android `Context_Click`; iOS `impactAsync(Medium)`.
- `bounce()` (list end): Android `AndroidHaptics.Reject` (reported present in installed typings); iOS Heavy impact or Warning notification.
- Settings toggle for haptics is applied at boot via `setHapticsEnabled`.

### Library
- Types: `Source = 'mediastore' | 'imported'`; `SourceFile`; `Tags`; `Track`; `Permission = granted | denied | blocked`; `ScanProgress`; `LibraryProvider { name, source, isSupported(), ensurePermission(), listFiles() }`.
- IDs: MediaStore tracks `"ms:" + assetId`; imported tracks `"imp:" + fnv(filename + size)`.
- SQLite (WAL, `PRAGMA user_version` migrations): `tracks` table with sort-key columns (`title_sort`, `artist_sort`, `album_sort`, `album_artist_sort`), `rel_path`, `artwork_path` (relative), `track_no`, `disc_no`, `duration_ms`, `added_at`, `modified_at`; indexes on sort columns and source; a `settings` key/value table. Artists grouped by `COALESCE(NULLIF(album_artist,''), artist)`. Unknown values: "Unknown Artist" / "Unknown Album" / filename-derived title.
- `sortKey`: lowercase, strip diacritics, strip leading "the/a/an", empty becomes "~".
- Indexer (`syncLibrary`): list files → diff vs index by id + `modifiedAt` → read tags only for new/changed (concurrency 4, yield to UI) → batch upsert → prune missing. **Prune guard**: skip pruning when the listing is empty but the index is not (probable permission revoke). Planned improvement: also require permission = granted.
- MediaStore provider filters tracks shorter than a threshold (default 30 s, user setting 0/30/60) because MediaStore audio includes ringtones/notification sounds.
- Imported-files provider: `expo-document-picker` with `copyToCacheDirectory: true` (SAF `content://` URIs cannot be streamed by `File.copy`), copy into `documentDirectory/music/`, delete the cache copy. Works on both platforms; it is the **only** source on iOS.
- Tag reading (`metadata.ts`, `readTags()`): `@missingcore/react-native-metadata-retriever` on Android (reported to read `content://` URIs via `MediaItem.fromUri`). Fallback chain: `parseFilename()` → parent folder name as album → Unknown. Embedded artwork saved to `documentDirectory/artwork/<fnv(album+albumArtist)>.jpg`, deduped per album. A failing file never aborts a scan.

### UI and navigation
- `menuStack.ts`: stack of frames `{ id, title, kind: menu|list|progress|message|nowplaying|settings, items|loader, selectedIndex, windowStart }`. `moveSelection(dir)` clamps and returns `'moved' | 'bounced'`; selection and window position are preserved per frame on pop.
- `MenuList.tsx` renders only the visible window slice (no FlatList), fixed row height, inverted highlight, chevrons, scrollbar. Must stay smooth at 20,000 rows.
- Menu tree: Main Menu → Music (Playlists [placeholder], Artists → artist → All Songs / albums → tracks, Albums, Songs), Shuffle Songs, Settings (Update Library [Android], Import Files, Library Info, Wheel Tick Size, Haptics On/Off, Min Track Length, Reset Library with two-step confirm), About.
- Empty-library, permission-denied ("Allow access") and permission-blocked ("Open Settings" → `Linking.openSettings()`) states are explicit rows. First launch never auto-scans silently.
- `player/store.ts` currently exposes **stubs** with stable signatures: `requestPlay(queue, startIndex)`, `togglePlay()`, `next()`, `prev()`; they console-log and push a text-only Now Playing frame. Phase 4 replaces the internals, not the signatures.

### Player contract (Phase 4 — implemented in `src/player/engine.ts`)
```ts
export type PlayerStatus = {
  positionMs: number;   // ms
  durationMs: number;   // ms, 0 until known
  playing: boolean;
  index: number;        // within the materialised queue
  didJustFinish: boolean; // one-shot advance signal
};

export interface PlayerEngine {
  load(queue: Track[], startIndex: number): Promise<void>;
  play(): void; pause(): void; next(): void; prev(): void;
  togglePlay(): void;
  seek(ms: number): void;
  setVolume(v: number): void; // 0..1
  onStatus(cb: (s: PlayerStatus) => void): () => void;
  dispose(): void;
}
```
Now Playing: artwork, title/artist/album, progress and volume bars. Wheel rotation = volume by default on the Now Playing frame; Next/Prev/Play zones still work there. Scrub mode and the separate click-sound player are Phase 5.

## 7. Status

| Phase | State |
|---|---|
| 1. Scaffold, SVG body + wheel, `useClickWheel`, haptics, debug overlay | Done, runs |
| 2. LCD UI, menu stack, windowed list, bounce haptic | Implemented (static checks only) |
| 3. Library layer, MediaStore + imported providers, indexer, sqlite | Implemented (static checks only) |
| 3.1 Hardening (see §8) | **Pending** |
| CI/GitHub Actions + repo hygiene (see §9) | **Pending**; a draft `.github/workflows/build-apk.yml` exists, untracked, never run |
| 4. Audio engine, queue, Now Playing | **Implemented (static checks only)**; JS bundle OK; **needs native rebuild** to link expo-audio |
| 5. Click sound, settings polish, transitions | Not started |
| 6. Background playback + lock-screen controls | Not started |
| 7. iPhone port | Not started |

Static verification reported by the Phase 2–3 agent: `tsc --noEmit` exit 0; `expo export --platform android` bundled; `scripts/check-pure.ts` 35/35 (sortKey, parseFilename, fnv, computeWindow, visibleRowCount); `expo config --type prebuild` resolves permissions `READ_MEDIA_AUDIO` + `READ_EXTERNAL_STORAGE` and plugins. **None of this proves runtime behavior.** The first `npx expo run:android` was blocked by `adb`/SDK env vars not set and then by the slow first Gradle build; no on-device result exists yet.

Phase 4 (this session) static verification: `tsc --noEmit --noUnusedLocals --noUnusedParameters` exit 0; `expo export --platform android` bundled (1357 modules); `expo config --type prebuild` now resolves the `expo-audio` plugin (`recordAudioAndroid: false` → `MODIFY_AUDIO_SETTINGS` + `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, iOS `UIBackgroundModes: ["audio"]`, and the `AudioControlsService` MediaSessionService on prebuild). All expo-audio calls were checked against the installed `node_modules/expo-audio@58.0.10/build/*.d.ts`, not from memory. **Still no on-device audio proof**: the installed dev client was built (16:44) before expo-audio entered `node_modules` (17:27), so it does NOT contain the `ExpoAudio` native module — the next `expo run:android`/prebuild+gradlew must run before any playback works.

## 8. Known risks and pending hardening (Phase 3.1)

1. **iOS has no tag reader.** The retriever is Android-only, so imported files on iPhone fall back to filename parsing (no real artist/album/track number/artwork). Needs a decision: `music-metadata` with partial reads, `jsmediatags`, or a small Swift `AVAsset` Expo module (needs a Mac-side/cloud build). Spike first, then decide.
2. The retriever's import must be **lazy and Android-guarded** so an iOS bundle never throws at import time (prove with `npx expo export --platform ios`).
3. **MediaStore pagination** ordered by `CREATION_TIME` with `offset` is unstable if files change mid-scan. Order by a stable key (asset id), fetch a total count up front, key rows by id.
4. **Artwork:** concurrent tag reads can write the same album art twice (needs a single-flight map keyed by album); check existence before decoding base64; cap artwork size (huge embedded images blow memory).
5. **Silent degradation:** if the native tag reader is unavailable or a file used fallback tags, surface it in Library Info (reader status, fallback count, failed count, last scan duration).
6. **Prune guard:** require permission granted in addition to the empty-listing rule.
7. **Dependency drift:** versions are hand-pinned because `expo install` is blocked; commit `package-lock.json`, pin exact versions, run `npx expo-doctor` if it works.
8. **Metadata retriever on a real device** is a third-party native module over an unstable AndroidX API. If the app crashes at scan start: `adb logcat | Select-String "metadataretriever"`.
9. Playback of MediaStore `content://` URIs through `expo-audio` must be verified on-device before Phase 4 is considered done (ExoPlayer supports `content://`, but SDK 58 behavior is unverified). The engine wraps `replace()`/`play()`/`seekTo()` in try/catch so a bad uri degrades to a logged error + paused state instead of crashing.
10. **The installed dev client predates expo-audio.** `android/` was generated at 16:44 and expo-audio landed at 17:27; the generated autolinking list has no `ExpoAudio` module. **A native rebuild (`expo run:android` or prebuild + gradlew) is required before any playback**, and the `expo-audio` config plugin (added to `app.json` this session) must be applied by that prebuild. Rule 8 applies: ask before running the build.
11. **Queue is windowed, not full.** `requestPlayByIds` materialises a 200-track window starting at the selection (fixed this session so any `startIndex` plays the right track); Now Playing shows `n/200` and the queue wraps within the window. Streaming the full 20k queue is a later refinement.
12. **`interruptionMode` is `doNotMix`** (exclusive audio focus; also required for Phase 6 lock-screen controls). If the owner prefers ducking, change `configureAudioMode()` in `src/player/expoAudio.ts`.
13. **Volume is not persisted** across launches (resets to 1.0). Intended for Phase 5 settings polish, not implemented this session.

## 9. Build, CI and distribution plan

- **Local Android (now):** `npx expo run:android` with a USB-debugging phone. Logs: `adb logcat -c` then `adb logcat ReactNativeJS:V AndroidRuntime:E *:S`.
- **`android/` and `ios/` are generated** by `expo prebuild`: gitignore them; configuration belongs in `app.json` / plugins. Local edits inside `android/` (e.g. `reactNativeArchitectures=arm64-v8a` in `gradle.properties` to build one ABI) are not persisted.
- **GitHub Actions (planned):**
  - `ci.yml`: on push/PR, `npm ci`, typecheck, `check-pure`, and `expo export` for both platforms.
  - `build-apk.yml`: `workflow_dispatch` + tags `v*`; `expo prebuild --platform android`, `assembleRelease`, re-sign the release APK with `apksigner` using secrets `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD` (alias default `ipod`); if secrets are absent, still build and label the artifact as debug-key signed. Attach to a GitHub Release on tags.
  - `build-ios.yml`: `macos-latest`, `expo prebuild --platform ios`, `xcodebuild archive` with code signing disabled, package an **unsigned `.ipa`**, attach to a GitHub Release on tags.
  - Everything about the runners (Xcode version, image, action versions) is **UNVERIFIED** until the first run.
- **Install on iPhone:** download the Release `.ipa` in Safari on the phone → share to **SideStore** (preferred first; behaves like a normal app) or **LiveContainer** (conserves free-account app slots; test background audio and haptics separately because the host process applies). Free Apple ID signing expires every 7 days; check current app/App-ID caps.
- Release keystore: create one now (`keytool -genkeypair -v -storetype PKCS12 ... -alias ipod`), **back it up outside the repo**. Never commit keystores or print secrets.
- Identity (**CONFIRM**): proposed `android.package` / `ios.bundleIdentifier` = `com.mihirx.ipodplayer`. Choose before the first installed build; changing it later makes the OS treat it as a different app. `ios.infoPlist.UIBackgroundModes: ["audio"]` is needed for background playback.

## 10. Test protocol (run on a real phone; Phase 4 on-device audio checks are the current priority)

1. Build and boot; persisted settings load without crash.
2. Seed 5,000 fake tracks (dev seed): fast wheel spins across the list, no dropped ticks, bounce haptic at both ends, selection preserved after back.
3. Permission flows: deny once, deny twice (shows Open Settings), grant.
4. Scan the real library: compare total with a device count (`adb shell "find /sdcard -type f -name '*.mp3' | wc -l"`, repeat per extension; approximate); record time per 100 files; UI stays responsive.
5. Relaunch: index persists; rescan is incremental and takes seconds.
6. Delete a file, rescan: track disappears. Revoke audio permission in system settings, reopen: index is **not** wiped.
7. Tag edge cases: tagless file, non-ASCII names, compilation album, "The …" artists sorting.
8. Import Files incl. one ~100 MB FLAC; kill the app mid-copy; verify cache cleanup and no half-written library.

On any failure, capture the full logcat/Metro/Gradle output (for Gradle, the first `FAILURE: Build failed with an exception` block).

## 11. Decisions still open

- Bundle id / package name (CONFIRM).
- iOS tag-reading strategy (spike pending).
- Background playback/lock-screen engine: keep `expo-audio` (`setActiveForLockScreen`, already wired in the plugin) vs switching to `react-native-track-player`; decide in Phase 6 after the `content://` test.
- Figma assets and font: the original iPod UI used Chicago/Helvetica-style fonts; check licensing before bundling. Export the wheel/body as SVG; wheel hit areas stay computed from geometry, not SVG paths.
- Whether to downscale artwork (needs a dependency such as `expo-image-manipulator`; ask first).

## 12. Quick command reference (PowerShell)

```powershell
cd C:\Users\sutha\Documents\ipod-player
adb devices                                   # expect a line ending in "device"
npx expo run:android                          # native build + install (first run is slow)
npx expo start                                # Metro only (after a dev build is installed)
npx tsc --noEmit
npx tsc --noEmit --noUnusedLocals --noUnusedParameters
npx --yes tsx@4 scripts/check-pure.ts
npx expo export --platform android            # JS bundling smoke test
npx expo export --platform ios
npx expo config --type prebuild               # resolved app config (read-only)
```

## 13. When you finish a task

Report: files created/changed, commands run with exit status, what was verified on a device vs only statically, new risks, and what you could not verify. Update §7 (Status) and §8 (Risks) of this file if they changed. Then stop and wait; do not start the next phase unprompted.
