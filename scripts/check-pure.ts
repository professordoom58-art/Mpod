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

// --- summary ---------------------------------------------------------------
console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.error(`${failures} FAILED`);
  process.exit(1);
}
console.log('all pure-function checks passed');
