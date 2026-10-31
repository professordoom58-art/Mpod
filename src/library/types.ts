/**
 * Shared library-layer types.
 *
 * A Track is the row we persist. A SourceFile is what a provider hands us
 * before tags are read. Keeping them separate means the indexer can diff
 * cheaply (SourceFile only) and only pay for full Track construction on
 * new/changed files.
 */

export type Source = 'mediastore' | 'imported';

export interface SourceFile {
  /** Stable id: "ms:<asset id>" or "imp:<fnv>". */
  id: string;
  /** Readable uri at scan time. content:// for mediastore, file:// for imported. */
  uri: string;
  /** Path relative to documentDirectory. Only for imported files. */
  relPath?: string;
  filename: string;
  /** ms since epoch. */
  modifiedAt: number;
  sizeBytes?: number;
  durationMs?: number;
}

export interface Tags {
  title?: string;
  artist?: string;
  album?: string;
  albumArtist?: string;
  trackNo?: number;
  discNo?: number;
  durationMs?: number;
  /**
   * True when the title came from the file's own tags rather than from the
   * filename fallback. Used by Library Info to count fallback-tagged tracks.
   */
  tagsFromFile?: boolean;
  artwork?: { base64?: string; uri?: string; mime?: string };
}

export interface Track {
  id: string;
  source: Source;
  uri: string;
  relPath?: string;
  title: string;
  artist: string;
  album: string;
  albumArtist: string;
  trackNo: number;
  discNo: number;
  durationMs: number;
  /** Relative to documentDirectory, e.g. "artwork/a1b2c3d4.jpg". */
  artworkPath?: string;
  addedAt: number;
  modifiedAt: number;
}

export type Permission = 'granted' | 'denied' | 'blocked';

export type ScanPhase = 'listing' | 'reading' | 'saving' | 'done' | 'error';

export type ScanProgress = {
  phase: ScanPhase;
  done: number;
  total: number;
  message?: string;
};

export type ScanResult = {
  added: number;
  updated: number;
  removed: number;
  failed: number;
  total: number;
  ms: number;
  /** Tracks whose title had to come from the filename fallback. */
  fallbackTags?: number;
};

export interface LibraryProvider {
  name: string;
  source: Source;
  isSupported(): boolean;
  ensurePermission(): Promise<Permission>;
  listFiles(): Promise<SourceFile[]>;
}

/** Light rows for list screens. Full Track only when something plays. */
export type ArtistRow = {
  name: string;
  sortKey: string;
  trackCount: number;
};

export type AlbumRow = {
  name: string;
  artist: string;
  sortKey: string;
  trackCount: number;
  artworkPath?: string;
};

export type TrackRow = {
  id: string;
  title: string;
  artist: string;
  album: string;
  durationMs: number;
};

export const UNKNOWN_ARTIST = 'Unknown Artist';
export const UNKNOWN_ALBUM = 'Unknown Album';
