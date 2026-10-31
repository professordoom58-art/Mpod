# iOS tag reading for the imported-files path

Status: **spike / report only.** Nothing here is implemented. Phase 4 is off limits.

## The problem

`@missingcore/react-native-metadata-retriever` is Android-only. Verified against
the installed package: it ships `android/`, `lib/`, `src/` and **no `ios/`
directory and no `.podspec`**. So on iOS every imported file is tagged by
`parseFilename()` alone: no real artist, album, track number, or artwork.

That is acceptable for a first iOS build and unacceptable as a shipping state.

## Options

| Option | iOS | Android | Native code | Reads `content://` | Artwork | Bundle cost | Maintenance |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `@missingcore/react-native-metadata-retriever` (today) | **No** | Yes | Yes (Kotlin) | Yes | Yes | small | active |
| `music-metadata` | Yes | Yes | **No** (pure JS) | No (needs a file path) | Yes | ~1.2 MB min | very active |
| `jsmediatags` | Yes | Yes | No (pure JS) | No | Yes | ~200 KB | effectively unmaintained |
| Swift `AVAsset` Expo module | Yes | n/a | **Yes (Swift)** | Yes | Yes | small | you own it |

### `music-metadata`

Pure JS, no native code, so it needs no rebuild and no Mac. Two real problems:

1. **It needs random access to a file.** It reads the header, seeks to the
   `moov`/`id3` atom, and reads only that region. It does this through a
   `tokenizer` that accepts an `IRandomReader`. On React Native you must supply
   that reader yourself over `expo-file-system`'s `FileHandle` (`open()` /
   `read()`), because there is no Node `fs`. That adapter is the actual work:
   roughly 60–100 lines, and it must handle partial reads correctly.
2. **Bundle and polyfills.** The ESM build pulls in Node-ish globals. In practice
   you need `stream`/`buffer` shims or the browser build. Expect Metro config
   changes and a bundle increase of roughly 1 MB. It is JS-only, so it is
   allowed under your npm policy and needs no native rebuild.

**`m4a` with `moov` at the end** is the classic trap: the atom index is at the
end of the file, so a naive "read the first 64 KB" fails. `music-metadata`
handles this correctly *if* the random reader can seek backwards. A reader built
on a forward-only stream will silently return no tags for those files. This is
the single most likely bug in a hand-rolled adapter.

**Memory on a 100 MB FLAC:** fine, *because* it seeks. It reads the metadata
blocks at the head of the file and the picture block, not the audio. The risk is
not the file size, it is a buggy reader that reads the whole file into a
`Uint8Array`. Cap reads explicitly (e.g. never read more than 2 MB per file) and
the 100 MB FLAC case is a non-issue.

### `jsmediatags`

Simpler and much smaller, but unmaintained for years, weaker on FLAC/Opus, and
it has the same random-access requirement. Not worth adopting in 2026.

### Swift `AVAsset` Expo module

The technically best answer: `AVURLAsset` + `load(.commonMetadata)` is the
platform's own reader, handles every format iOS supports, reads `content://`
equivalents and `file://` alike, and returns artwork. Cost: you write and
maintain a Swift Expo module, and **you cannot build or test it on Windows**.
Every iteration is a CI round trip on a macOS runner, and a broken module breaks
the iOS build entirely. That is a bad trade while you have no Mac.

## Recommendation

**Do not port tag reading to iOS yet.** Keep the filename fallback for the first
iOS build, and revisit in this order:

1. **Now:** ship iOS with `parseFilename()`. It is honest, it is already
   implemented, and Library Info already reports "Filename fallback (iOS)" so the
   degradation is visible rather than silent.
2. **If iOS matters before you have a Mac:** add `music-metadata` behind the
   existing `readTags()` seam in `src/library/metadata.ts`, with an
   `expo-file-system` `FileHandle` random reader. JS-only, no native rebuild, no
   Mac needed. Budget for the `moov`-at-end bug and for Metro polyfills.
3. **Only with a Mac (or a reliable CI loop):** the Swift `AVAsset` module. It is
   the right long-term answer and the wrong first move.

The seam already exists: `readTags(file: SourceFile): Promise<Tags>` is the only
thing the indexer calls, and `hasNativeTagReader()` is the only capability probe.
Swapping the iOS branch is a one-file change with no indexer or UI edits.

## What is unverified

- `music-metadata`'s exact behaviour under Metro/Hermes with an
  `expo-file-system` reader. Not tested; no code was written.
- Its current bundle size on this project. The figure above is an estimate.
- Whether `FileHandle` in expo-file-system 58.0.13 supports the seek pattern a
  random reader needs. `open(mode)` and `FileMode.ReadOnly` exist in the typings,
  but the read/seek semantics were not exercised.
- Any Swift module behaviour: cannot be built on Windows.
