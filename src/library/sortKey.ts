/**
 * Pure sorting and filename-parsing helpers. No imports, no side effects, so
 * these are the functions worth unit-testing.
 */

const LEADING_ARTICLE = /^(the|a|an)\s+/;
const DIACRITIC = /[\u0300-\u036f]/g;

/**
 * Normalises a label for alphabetical ordering the way an iPod does:
 * case-insensitive, accent-insensitive, leading "The"/"A"/"An" ignored.
 * Empty input sorts last via "~" (tilde is after every letter).
 */
export function sortKey(value: string | null | undefined): string {
  if (!value) return '~';
  const stripped = value
    .normalize('NFD')
    .replace(DIACRITIC, '')
    .toLowerCase()
    .trim()
    .replace(LEADING_ARTICLE, '')
    .trim();
  return stripped.length > 0 ? stripped : '~';
}

/** Strips a trailing extension, e.g. "song.mp3" -> "song". */
function stripExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return name;
  return name.slice(0, dot);
}

/**
 * Best-effort title/artist from a filename. Handles the common shapes:
 *   "Artist - Title"       -> { artist, title }
 *   "01 - Title"           -> { title }  (track number dropped)
 *   "01. Title"            -> { title }
 *   "01 Title"             -> { title }
 *   "some_song_name"       -> { title: "some song name" }
 * Anything unparseable comes back as a title only, never as undefined.
 */
export function parseFilename(filename: string): { artist?: string; title: string } {
  const base = stripExtension(filename)
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (base.length === 0) return { title: filename };

  // "01 - Title" / "01. Title" / "01) Title"
  const numbered = /^(\d{1,3})\s*[-.)]\s*(.+)$/.exec(base);
  if (numbered && numbered[2]) {
    return { title: numbered[2].trim() };
  }

  // "01 Title" (leading track number followed by whitespace)
  const spacedNumber = /^(\d{1,3})\s+(.+)$/.exec(base);
  if (spacedNumber && spacedNumber[2]) {
    return { title: spacedNumber[2].trim() };
  }

  // "Artist - Title". Split on the first " - " so titles containing hyphens survive.
  const dash = base.indexOf(' - ');
  if (dash > 0) {
    const artist = base.slice(0, dash).trim();
    const title = base.slice(dash + 3).trim();
    if (artist.length > 0 && title.length > 0) {
      return { artist, title };
    }
  }

  return { title: base };
}
