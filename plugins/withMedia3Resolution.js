/**
 * Expo config plugin: keep the Media3 dedupe in android/build.gradle across
 * every `expo prebuild`.
 *
 * `android/` is generated and gitignored, so editing it by hand is not
 * durable. This plugin injects the two rules described in AGENTS.md §8:
 *
 *   1. Root project — resolutionStrategy
 *        @missingcore/react-native-metadata-retriever 3.2.1 depends on a
 *        repackaged Media3 fork under `com.github.MissingCore.media` whose
 *        AARs keep the `androidx.media3.*` package names, while expo-audio
 *        pulls the standard `androidx.media3` modules. Both therefore ship
 *        the same classes and the build fails with duplicate class errors.
 *        Every fork module is redirected onto its upstream counterpart
 *        (the same extractor/common/container/decoder set; `media3-inspector`
 *        exists upstream at the same version), so only one copy of each class
 *        can ever reach the APK.
 *
 *   2. Retriever subproject — a dependency constraint pinning
 *        `androidx.media3:media3-common` to the same version. The fork's
 *        media3-common brings a `org.jetbrains.kotlin:kotlin-bom:1.8.0`
 *        BOM that would otherwise pull kotlin-stdlib:1.8.0 into that module
 *        and make the module's Kotlin (2.2, AGP 9) fail with
 *        "Module was compiled with an incompatible version of Kotlin".
 *
 * Idempotent: re-running prebuild replaces the managed blocks instead of
 * stacking copies (older prebuilds injected one copy per run).
 */

const { withProjectBuildGradle } = require('expo/config-plugins');

const MEDIA3_VERSION = '1.9.3';
const FORK_GROUP = 'com.github.MissingCore.media';

// Distinct names on purpose: a plain `BEGIN ipod-player media3 dedupe` would
// also prefix-match the retriever markers below.
const BEGIN = '// BEGIN ipod-player media3 dedupe (root)';
const END = '// END ipod-player media3 dedupe (root)';
const RETRIEVER_BEGIN = '// BEGIN ipod-player media3 dedupe (retriever module)';
const RETRIEVER_END = '// END ipod-player media3 dedupe (retriever module)';
const RETRIEVER_PROJECT = 'missingcore_react-native-metadata-retriever';

const ROOT_SUFFIX = '(mirrored by plugins/withMedia3Resolution.js)';

// Body without the begin/end marker lines. Kept at the indentation used inside
// `allprojects { ... }` in android/build.gradle.
const ROOT_BODY = `
  //
  // @missingcore/react-native-metadata-retriever 3.2.1 depends on a repackaged
  // Media3 fork (${FORK_GROUP}:media3-*:${MEDIA3_VERSION}-MissingCore.1)
  // that keeps the androidx.media3.* package names, while expo-audio pulls the
  // standard androidx.media3 modules. Both therefore ship the same classes and
  // the APK step fails with duplicate class errors.
  //
  // Every fork module is redirected onto its upstream counterpart, which
  // publishes the same class set (media3-inspector included), so exactly one
  // copy of every androidx.media3 class ends up in the graph. The explicit
  // extractor substitution documents the original failure; eachDependency
  // covers the rest of the fork modules (common, container, decoder,
  // datasource, database, effect, exoplayer, inspector, ...).
  //
  // Keep this block identical to the config plugin, or a prebuild will not
  // reproduce it.
  configurations.all {
    resolutionStrategy {
      dependencySubstitution {
        substitute module('${FORK_GROUP}:media3-extractor') using module('androidx.media3:media3-extractor:${MEDIA3_VERSION}')
      }
      eachDependency { details ->
        if (details.requested.group == '${FORK_GROUP}') {
          details.useTarget "androidx.media3:\${details.requested.name}:${MEDIA3_VERSION}"
        }
      }
    }
  }
`;

// Full managed block, indented to sit inside `allprojects { ... }`.
const ROOT_BLOCK_LINES = `  ${BEGIN} ${ROOT_SUFFIX}${ROOT_BODY}  ${END}`;

// What gets inserted after `allprojects { repositories { ... }` (or right after
// the opening brace when there is no repositories block). Byte-identical to
// ROOT_BLOCK_LINES so replacing an existing copy reproduces the same output.
const ROOT_INSERT = `\n\n${ROOT_BLOCK_LINES}`;

// Body only: the begin/end markers wrap the surrounding `configurations`
// block so that findBlock sees a properly nested pair. One preceding newline
// only: re-running must reproduce the same bytes (see applyRetrieverKotlinPin).
const RETRIEVER_CONSTRAINT = `
      constraints {
        add('implementation', "org.jetbrains.kotlin:kotlin-stdlib:\${rootProject.ext.kotlinVersion}")
      }`;



/**
 * Locates a previously injected managed block: the begin marker is matched on
 * its whole line, so `(root)` never matches `(root) (mirrored ...)` or the
 * retriever markers.
 */
function findBlock(contents, beginMarker, endMarker) {
  const beginLine = new RegExp(`^[ \\t]*${escapeRegExp(beginMarker)}(?=[ \\t]|\\r?$)`, 'm');
  const begin = beginLine.exec(contents);
  if (!begin) return null;

  const endIndex = contents.indexOf(endMarker, begin.index);
  if (endIndex === -1) {
    // Truncated/edited block: treat the rest of the file as the block's tail so
    // the next prebuild heals it.
    return { start: begin.index, end: contents.length };
  }
  return { start: begin.index, end: endIndex + endMarker.length };
}

/** Escapes a literal string for use inside a RegExp. */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Applies the root-resolution block to a Groovy root build.gradle string.
 * Replaces an existing block (idempotent). Exported for tests.
 */
function applyMedia3Resolution(contents) {
  const anchor = 'allprojects {';
  if (!contents.includes(anchor)) {
    throw new Error(
      '[withMedia3Resolution] android/build.gradle has no "allprojects {" block to patch',
    );
  }

  // When a previous copy exists, replace it in place (no whitespace drift on
  // re-runs). Otherwise insert after the `repositories { ... }` block that the
  // Expo template puts right inside `allprojects`; the helper below is written
  // so both paths emit exactly the same bytes.
  const existing = findBlock(contents, BEGIN, END);
  if (existing) {
    return contents.slice(0, existing.start) + ROOT_BLOCK_LINES + contents.slice(existing.end);
  }

  const open = contents.indexOf(anchor);
  const close = findBlockEnd(contents, open + anchor.length);
  const insertAt = close === -1 ? open + anchor.length : close + 1;
  return contents.slice(0, insertAt) + `${ROOT_INSERT}` + contents.slice(insertAt);
}

/**
 * Returns the index of the `}` matching the `{` that precedes `from`, or -1.
 * Brace counting is enough for the Expo template (no braces in strings/comments
 * inside `allprojects { repositories { ... } }`), and it only runs on prebuild.
 */
function findBlockEnd(contents, from) {
  let depth = 1;
  for (let i = from; i < contents.length; i += 1) {
    if (contents[i] === '{') depth += 1;
    else if (contents[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Pins kotlin-stdlib inside the retriever module's configurations (the fork's
 * media3-common carries a kotlin-bom that would otherwise force 1.8.0 there).
 * Replaces an existing block (idempotent). Exported for tests.
 */
function applyRetrieverKotlinPin(contents) {
  // The retriever module is contributed by React Native autolinking, so no
  // plugin in settings.gradle is guaranteed to own it: hook configuration from
  // the root project instead. `withDependencies` runs when the configuration
  // resolves, so the project only has to exist by then (it does, at apply time).
  //
  // Why: the fork's media3-common POM carries `kotlin-bom:1.8.0`, whose strict
  // alignment drops kotlin-stdlib to 1.8.0 inside the retriever module; the
  // module then fails to build against the Kotlin 2.x toolchain (AGP 9).
  const snippet =
    `  ${RETRIEVER_BEGIN}` +
    `\n  project(':${RETRIEVER_PROJECT}').configurations.configureEach {` +
    `\n    withDependencies {${RETRIEVER_CONSTRAINT}\n    }\n  }\n` +
    `  ${RETRIEVER_END}`;

  const anchor = 'allprojects {';
  const at = contents.indexOf(anchor);
  if (at === -1) {
    throw new Error(
      '[withMedia3Resolution] android/build.gradle has no "allprojects {" block to patch',
    );
  }

  const existing = findBlock(contents, RETRIEVER_BEGIN, RETRIEVER_END);
  if (existing) {
    // existing.start points at the begin marker, which carries no indentation
    // (it is matched line-wise); re-emit the snippet with its own indent.
    const lastLineBreak = contents.lastIndexOf('\n', existing.start);
    return contents.slice(0, lastLineBreak + 1) + snippet + contents.slice(existing.end);
  }

  return contents.slice(0, at) + snippet + '\n\n' + contents.slice(at);
}

module.exports = function withMedia3Resolution(config) {
  config = withProjectBuildGradle(config, (config) => {
    // Only Groovy is generated by the Expo template; skip Kotlin DSL safely.
    if (config.modResults.language !== 'groovy') return config;
    config.modResults.contents = applyRetrieverKotlinPin(
      applyMedia3Resolution(config.modResults.contents),
    );
    return config;
  });
  return config;
};

module.exports.applyMedia3Resolution = applyMedia3Resolution;
module.exports.applyRetrieverKotlinPin = applyRetrieverKotlinPin;
