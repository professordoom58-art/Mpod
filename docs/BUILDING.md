# Building and releasing

All builds run on GitHub Actions. Nothing here requires Xcode or Android Studio
locally.

| Workflow | File | Trigger | Output |
| --- | --- | --- | --- |
| CI | `.github/workflows/ci.yml` | push to `main`, pull requests | typecheck + pure checks + JS bundles for both platforms |
| Android APK | `.github/workflows/build-apk.yml` | `workflow_dispatch`, tags `v*` | signed (or debug-key) `.apk` |
| iOS IPA | `.github/workflows/build-ios.yml` | `workflow_dispatch`, tags `v*` | **unsigned** `.ipa` for SideStore / LiveContainer |

The repository is set up so `android/` and `ios/` are generated output: CI runs
`expo prebuild` on every build and they are gitignored.

---

## 1. Trigger a build

From the GitHub UI: **Actions → Android release APK / iOS unsigned IPA → Run workflow**.
The Android workflow has an `arm64-only` input (default **true**). Set it to
false if you need a 32-bit-capable APK.

With the GitHub CLI:

```powershell
gh workflow run build-apk.yml -f arm64-only=true
gh workflow run build-ios.yml
gh run list --workflow=build-apk.yml
gh run watch
```

Every run uploads its artifact (`ipod-player-apk` / `ipod-player-ipa`) and keeps
it for 14 days. A failed run also uploads `gradle-logs` / `xcodebuild-logs`.

Push builds (CI) cancel superseded runs on the same ref; tag builds do the same,
so pushing two tags in a row cancels the older build.

---

## 2. One-time signing setup (Android)

The keystore is the identity of the app on the device. If you lose it, existing
installs cannot be upgraded — only uninstalled and reinstalled.

Run these **yourself**, in PowerShell, in a directory that is NOT the project
folder (the keystore must never be committed):

```powershell
# 1. Create a PKCS12 keystore. keytool prompts for the password — do not put it
#    on the command line (it would land in your shell history).
keytool -genkeypair -v `
  -keystore ipod-release.keystore `
  -alias ipod `
  -keyalg RSA -keysize 2048 -validity 10000 `
  -storetype PKCS12

# 2. Base64-encode it (single line, no wrapping).
$b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes("$PWD\ipod-release.keystore"))
$b64 | Set-Clipboard

# 3. Back the keystore up somewhere safe, offline.
```

Set the repository secrets (Settings → Secrets and variables → **Actions** →
New repository secret), or with `gh`:

```powershell
gh secret set KEYSTORE_BASE64 --body "$b64"
gh secret set KEYSTORE_PASSWORD      # prompts, no echo
gh secret set KEY_ALIAS --body "ipod" # OPTIONAL; the workflow defaults to "ipod"
```

Notes:

- `KEYSTORE_BASE64` and `KEYSTORE_PASSWORD` are both required to sign. If either
  is missing the workflow still builds, but names the file
  `ipod-player-<version>-<sha7>-debugkey.apk` and prints a warning. That APK is
  signed with the debug key: it cannot upgrade a release-signed install, and it
  should not be published.
- CI decodes the keystore into `$RUNNER_TEMP` and deletes it on exit. The
  workflow runs `apksigner verify --print-certs` and fails if signing produced
  an invalid APK.
- CI sets `android.versionCode` from the workflow run number, so successive
  builds can upgrade each other.

---

## 3. Tag a release

Both native workflows trigger on `v*` tags and attach their artifact to the same
GitHub Release.

```powershell
git tag v0.1.0
git push origin v0.1.0
```

- The release is created on the first workflow that finishes; the second adds its
  artifact to the existing release. If you only want one platform, push the tag
  after temporarily disabling the other workflow.
- `package.json` version is what appears in the file name. Bump it before
  tagging if you want them to match (CI does not enforce this).
- Delete a bad tag with `git tag -d v0.1.0` and
  `git push origin :refs/tags/v0.1.0`, then re-tag.

---

## 4. Install the APK

Direct download: open the Release asset or the Actions artifact on the phone and
install it. Android will ask you to allow installs from that app.

Over USB:

```powershell
adb devices
adb install -r .\ipod-player-1.0.0-abc1234.apk
adb logcat -s ReactNativeJS:V
```

Uninstall first (`adb uninstall com.sutha.ipodplayer`) if the signature changed
(for example, debug-key build → release-signed build).

---

## 5. Install the IPA (no Mac)

The IPA is **unsigned**. SideStore or LiveContainer re-signs it with your free
Apple ID on the device.

SideStore (needs a one-time pairing setup):

1. Open the Release asset URL in **Safari** on the iPhone.
2. Download the `.ipa`.
3. Share → **SideStore** (or open SideStore → Library → + → pick the file).
4. Sign and install. The app stops working after 7 days until SideStore refreshes
   it while the phone is on the same network as the pairing host.

LiveContainer: import the `.ipa` into LiveContainer and launch it from there.
There is no 7-day app expiry for the container itself, but iOS still limits
free-account signing.

Limits for a free Apple ID (Apple changes these; check the current numbers):

- Signing certificate/profile expires after **7 days**; refresh required.
- A limited number of **App IDs per week** (historically 10).
- A limited number of **sideloaded apps per device** (historically 3).
- No push notifications, no background audio entitlements granted by Apple for
  free-account signing beyond what the app itself declares.

Because playback is Phase 4, treat background audio as untested on iOS until
then.

---

## 6. Troubleshooting

**`npm ci` fails on a clean runner (`EUSAGE` / lock mismatch)**
The lockfile no longer matches `package.json`. Run `npm install` locally (per
your npm policy) so `package-lock.json` is rewritten, then commit it.

**Android: `SDK location not found` / Gradle cannot find the SDK**
`expo prebuild` expects `ANDROID_HOME`; GitHub's `ubuntu-latest` image sets it.
If you see this after changing the runner, add an `android/local.properties`
step or export `ANDROID_HOME` explicitly.

**Android: `apksigner: not found`**
The signing step picks the highest `build-tools` version under `$ANDROID_HOME`.
If the runner image ships none, install one with `sdkmanager "build-tools;35.0.0"`
before signing.

**Android: build succeeds, artifact upload fails with "no files found"**
The APK path is `android/app/build/outputs/apk/release/app-release.apk`. If
Gradle produced a different variant (for example an ABI split), the upload step
fails on purpose. Check the "Build release APK" log for the produced path.

**iOS: `pod install` fails during prebuild**
`expo prebuild --platform ios` installs CocoaPods unless `--no-install` is
passed, and the iOS workflow deliberately does not pass it. Look for the
CocoaPods error in the "Prebuild iOS" step; a common cause is a podspec that
needs a newer CocoaPods than the image provides.

**iOS: `xcodebuild: error: The workspace ... does not contain a scheme named ...`**
The scheme is derived from the workspace basename. Run
`xcodebuild -list -workspace ios/<name>.xcworkspace` locally on a Mac (or read
the step log) and pass the real scheme explicitly if they differ.

**iOS: archive succeeds but the IPA is rejected by SideStore**
An unsigned IPA must still be a valid bundle. The packaging step verifies
`Info.plist`, `CFBundleIdentifier`, version fields and that `CFBundleExecutable`
exists. If SideStore rejects it, check the app bundle name (it should match
`CFBundleExecutable`) and that the file is a zip whose root is `Payload/`.

**Release was not created on a tag push**
Confirm the tag starts with `v`, and that the workflow has
`permissions: contents: write` on the release job. Repository settings can also
restrict `GITHUB_TOKEN` to read-only — check Settings → Actions → General →
Workflow permissions.

**Both tag workflows raced on the same Release**
They both call `softprops/action-gh-release@v2`, which updates an existing
release rather than failing. If you see a transient 422, re-run the failed job.

---

## 7. Unverified / assumed

These are not provable from this machine; check them on the first run.

- **`macos-latest` image and Xcode version.** The workflow assumes a current
  macOS image with Xcode 16+ and CocoaPods preinstalled, and uses
  `XCODE_VERSION: latest-stable`. Pin an explicit version after reading
  `xcodebuild -version` in the first run's log.
- **All GitHub Actions behavior** (marketplace versions, runner images, secret
  availability, artifact/release permissions). Local validation only proves the
  YAML parses against the action schema.
- **`ubuntu-latest` Android SDK contents** — specifically that a `build-tools`
  version with `apksigner` is present.
- **Activity/runner minutes** for the iOS workflow (macOS minutes are billed at a
  multiplier on private repositories).
- **SideStore / LiveContainer steps** are version-specific; follow their current
  documentation.
- **Free Apple ID limits** (7-day expiry, App ID and app-count caps).
- The unsigned IPA has **not** been installed on a device from this machine.
