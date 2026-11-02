/**
 * Pure-function checks for the library and windowing helpers.
 *
 * Run with:  npx --yes tsx@4 scripts/check-pure.ts
 *
 * These are deliberately dependency-free (no jest, no babel config) so they
 * cannot conflict with the Expo SDK's own versions. They assert real behaviour
 * and exit non-zero on the first failure.
 */

import { base64ByteLength } from '../src/library/base64Size';
import { fnvHex } from '../src/library/fnv';
import { parseFilename, sortKey } from '../src/library/sortKey';
import { computeWindow, visibleRowCount } from '../src/ui/windowing';
import {
  CHASSIS_COLOR_ORDER,
  DEFAULT_THEME_ID,
  THEME_ORDER,
  isChassisColor,
  isThemeId,
  resolveAppTheme,
  themePresets,
  type AppThemeConfig,
  type ThemeId,
} from '../src/ui/theme';

let failures = 0;
let checks = 0;

function eq(actual: unknown, expected: unknown, label: string): void {
  checks += 1;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    failures += 1;
    console.error(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`);
  }
}

// --- sortKey ---------------------------------------------------------------
eq(sortKey('The Beatles'), 'beatles', 'sortKey strips leading The');
eq(sortKey('A Tribe Called Quest'), 'tribe called quest', 'sortKey strips leading A');
eq(sortKey('An Coimisiun'), 'coimisiun', 'sortKey strips leading An');
eq(sortKey('Björk'), 'bjork', 'sortKey strips diacritics');
eq(sortKey('SIGUR ROS'), 'sigur ros', 'sortKey lowercases');
eq(sortKey('  The Cure  '), 'cure', 'sortKey trims');
eq(sortKey(''), '~', 'sortKey empty -> tilde');
eq(sortKey(null), '~', 'sortKey null -> tilde');
eq(sortKey('The The'), 'the', 'sortKey strips only one article');
eq(sortKey('Theatre'), 'theatre', 'sortKey does not strip "The" inside a word');

// --- parseFilename ---------------------------------------------------------
eq(parseFilename('Artist - Title.mp3'), { artist: 'Artist', title: 'Title' }, 'parse Artist - Title');
eq(parseFilename('01 - Title.mp3'), { title: 'Title' }, 'parse 01 - Title');
eq(parseFilename('01. Title.mp3'), { title: 'Title' }, 'parse 01. Title');
eq(parseFilename('01 Title.mp3'), { title: 'Title' }, 'parse 01 Title');
eq(parseFilename('some_song_name.mp3'), { title: 'some song name' }, 'parse underscores');
eq(parseFilename('Song - With - Dashes.mp3'), { artist: 'Song', title: 'With - Dashes' }, 'parse splits on first dash');
eq(parseFilename('NoExtension'), { title: 'NoExtension' }, 'parse no extension');
eq(parseFilename('.hidden.mp3'), { title: '.hidden' }, 'parse dotfile');

// --- base64ByteLength ------------------------------------------------------
eq(base64ByteLength(''), 0, 'base64: empty string is 0 bytes');
eq(base64ByteLength('TQ=='), 1, 'base64: one byte with padding');
eq(base64ByteLength('TWE='), 2, 'base64: two bytes with padding');
eq(base64ByteLength('TWFu'), 3, 'base64: three bytes no padding');
eq(base64ByteLength('data:image/jpeg;base64,TWFu'), 3, 'base64: data uri prefix ignored');
eq(base64ByteLength('TWFu\n'), 3, 'base64: whitespace ignored');
eq(base64ByteLength('A'.repeat(4000)), 3000, 'base64: 4000 chars is 3000 bytes');

// --- fnv -------------------------------------------------------------------
eq(fnvHex('').length, 8, 'fnv hex is 8 chars');
eq(fnvHex('abc'), fnvHex('abc'), 'fnv is stable');
eq(fnvHex('abc') !== fnvHex('abd'), true, 'fnv differs on different input');
eq(/^[0-9a-f]{8}$/.test(fnvHex('Björk - Homogenic')), true, 'fnv hex is lowercase hex');

// --- computeWindow ---------------------------------------------------------
// Selection travels inside the window; the window only moves at the edges.
eq(computeWindow(0, 0, 5, 20), 0, 'window: top stays at 0');
eq(computeWindow(4, 0, 5, 20), 0, 'window: last visible row does not scroll');
eq(computeWindow(5, 0, 5, 20), 1, 'window: one past the bottom scrolls by one');
eq(computeWindow(10, 0, 5, 20), 6, 'window: jump keeps selection at bottom edge');
eq(computeWindow(3, 10, 5, 20), 3, 'window: moving up scrolls to selection');
eq(computeWindow(19, 0, 5, 20), 15, 'window: clamps at the end');
eq(computeWindow(0, 15, 5, 20), 0, 'window: clamps at the start');
eq(computeWindow(2, 0, 5, 3), 0, 'window: everything fits -> 0');
eq(computeWindow(0, 0, 5, 0), 0, 'window: empty list -> 0');

// --- visibleRowCount -------------------------------------------------------
eq(visibleRowCount(100, 20), 5, 'rows: exact fit');
eq(visibleRowCount(109, 20), 5, 'rows: floors partial row');
eq(visibleRowCount(10, 20), 1, 'rows: never below 1');
eq(visibleRowCount(100, 0), 1, 'rows: guards zero height');

// --- theme presets ---------------------------------------------------------
// Settings > Themes is generated from THEME_ORDER, so these checks stand in for
// "the new presets are actually selectable and labelled correctly".
eq(
  THEME_ORDER.map((id) => themePresets[id].label),
  [
    'Classic Silver',
    'U2 Black/Red',
    'Space Gray',
    'Midnight Blue',
    'Soft Blue',
    'Bright Yellow',
    'Soft Pink',
    'Deep Red',
  ],
  'themes: menu order and friendly labels',
);
eq(THEME_ORDER.length, 8, 'themes: eight selectable presets');
eq(
  new Set(THEME_ORDER).size,
  THEME_ORDER.length,
  'themes: THEME_ORDER has no duplicate ids',
);
eq(
  Object.keys(themePresets).length,
  THEME_ORDER.length,
  'themes: THEME_ORDER lists every preset (none unreachable)',
);
eq(
  THEME_ORDER.every((id) => isThemeId(id)),
  true,
  'themes: isThemeId accepts every ordered id',
);
eq(isThemeId('softBlue'), true, 'themes: isThemeId accepts softBlue');
eq(isThemeId('brightYellow'), true, 'themes: isThemeId accepts brightYellow');
eq(isThemeId('softPink'), true, 'themes: isThemeId accepts softPink');
eq(isThemeId('deepRed'), true, 'themes: isThemeId accepts deepRed');
eq(isThemeId('chassis-nonsense'), false, 'themes: isThemeId rejects an unknown id');
eq(isThemeId(null), false, 'themes: isThemeId rejects null');

// Chassis-color aliases used by the Settings list.
eq(
  CHASSIS_COLOR_ORDER,
  THEME_ORDER,
  'themes: chassis order matches THEME_ORDER',
);
eq(
  ['softBlue', 'brightYellow', 'softPink', 'deepRed'].every((id) => isChassisColor(id)),
  true,
  'themes: isChassisColor accepts the four Nano presets',
);
eq(isChassisColor('u2-black-red'), true, 'themes: isChassisColor accepts a classic preset');
eq(isChassisColor('chassis-nonsense'), false, 'themes: isChassisColor rejects an unknown id');

// Stale persisted values and the id/label contract resolveAppTheme relies on.
eq(resolveAppTheme('chassis-nonsense', null).id, DEFAULT_THEME_ID, 'themes: unknown id falls back');
eq(resolveAppTheme('deepRed', null).label, 'Deep Red', 'themes: resolves the preset label');
eq(
  resolveAppTheme('softBlue', null).label,
  'Soft Blue',
  'themes: preset label without overrides',
);
eq(
  resolveAppTheme('softBlue', { accentColor: '#000000' }).label,
  'Soft Blue (custom)',
  'themes: overrides mark the label custom',
);
eq(
  resolveAppTheme('softBlue', { accentColor: '#000000' }).accentColor,
  '#000000',
  'themes: overrides win over the preset',
);
eq(
  resolveAppTheme('softBlue', null).accentColor,
  '#4A729A',
  'themes: softBlue accent',
);
eq(
  resolveAppTheme('brightYellow', null).accentColor,
  '#C29505',
  'themes: brightYellow accent',
);
eq(resolveAppTheme('softPink', null).accentColor, '#B85C7C', 'themes: softPink accent');
eq(resolveAppTheme('deepRed', null).accentColor, '#B71C1C', 'themes: deepRed accent');

// The Nano presets must keep a crisp satin-white ring with a colored Select
// button, per the FigPod finish spec.
eq(
  ['softBlue', 'brightYellow', 'softPink', 'deepRed'].map(
    (id) => (themePresets[id as ThemeId] as AppThemeConfig).wheelColor,
  ),
  ['#F7F7F7', '#F7F7F7', '#F7F7F7', '#F7F7F7'],
  'themes: Nano wheels are satin white',
);
eq(
  ['softBlue', 'brightYellow', 'softPink', 'deepRed'].map(
    (id) => (themePresets[id as ThemeId] as AppThemeConfig).centerButtonBg,
  ),
  ['#7CA1C4', '#E5B81B', '#D982A1', '#B71C1C'],
  'themes: Nano center buttons match their shells',
);
eq(
  resolveAppTheme('classic-silver', null).screenBgGradient,
  ['#5C5855', '#464340', '#35322F'],
  'themes: default Now Playing backdrop is the 3-stop warm matte',
);

// Every preset must be paintable: no empty required fields, a shell gradient
// (when present) is a real two-stop pair, and the screen gradient has 2-3 stops.
eq(
  THEME_ORDER.every((id) => {
    const t: AppThemeConfig = themePresets[id];
    const flat = [t.shellColor, t.wheelColor, t.wheelTextColor, t.accentColor];
    const okColour = flat.every((c) => /^#[0-9a-fA-F]{6}$/.test(c));
    const okGradient =
      t.shellGradient === undefined ||
      (t.shellGradient.length === 2 &&
        t.shellGradient.every((c: string) => /^#[0-9a-fA-F]{6}$/.test(c)));
    const okCenter =
      t.centerButtonBg === undefined || /^#[0-9a-fA-F]{6}$/.test(t.centerButtonBg);
    const okScreen =
      (t.screenBgGradient.length === 2 || t.screenBgGradient.length === 3) &&
      t.screenBgGradient.every((c: string) => /^#[0-9a-fA-F]{6}$/.test(c));
    return okColour && okGradient && okCenter && okScreen;
  }),
  true,
  'themes: every preset has valid #rrggbb colors and a 2-3 stop screen gradient',
);
eq(
  ['softBlue', 'brightYellow', 'softPink', 'deepRed'].every(
    (id) => (themePresets[id as ThemeId] as AppThemeConfig).shellGradient !== undefined,
  ),
  true,
  'themes: the four Nano presets carry a chassis gradient',
);

// --- summary ---------------------------------------------------------------
console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.error(`${failures} FAILED`);
  process.exit(1);
}
console.log('all pure-function checks passed');
