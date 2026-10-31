/**
 * SQLite persistence for the library index.
 *
 * Uses the async expo-sqlite API (openDatabaseAsync / execAsync / runAsync /
 * getAllAsync / getFirstAsync / withTransactionAsync), verified present in
 * expo-sqlite 58.0.14.
 *
 * Migrations are driven by PRAGMA user_version so future schema changes are
 * additive and idempotent.
 */

import * as SQLite from 'expo-sqlite';

import { fnvHex } from './fnv';
import { sortKey } from './sortKey';
import {
  UNKNOWN_ALBUM,
  UNKNOWN_ARTIST,
  type AlbumRow,
  type ArtistRow,
  type Source,
  type Track,
  type TrackRow,
} from './types';

const DB_NAME = 'ipod.db';
const SCHEMA_VERSION = 1;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = openAndMigrate();
  }
  return dbPromise;
}

async function openAndMigrate(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);

  // WAL keeps reads fast while the indexer writes, and survives a kill better.
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  const current = row?.user_version ?? 0;

  if (current < 1) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS tracks (
        id TEXT PRIMARY KEY NOT NULL,
        source TEXT NOT NULL,
        uri TEXT NOT NULL,
        rel_path TEXT,
        title TEXT,
        title_sort TEXT,
        artist TEXT,
        artist_sort TEXT,
        album TEXT,
        album_sort TEXT,
        album_artist TEXT,
        album_artist_sort TEXT,
        track_no INTEGER,
        disc_no INTEGER,
        duration_ms INTEGER,
        artwork_path TEXT,
        added_at INTEGER,
        modified_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_tracks_album_artist_sort ON tracks (album_artist_sort);
      CREATE INDEX IF NOT EXISTS idx_tracks_album_sort ON tracks (album_sort);
      CREATE INDEX IF NOT EXISTS idx_tracks_title_sort ON tracks (title_sort);
      CREATE INDEX IF NOT EXISTS idx_tracks_source ON tracks (source);

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT
      );
    `);
  }

  if (current < SCHEMA_VERSION) {
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  }

  return db;
}

/** Opens the database and runs migrations. Safe to call repeatedly. */
export async function initDb(): Promise<void> {
  await getDb();
}

// ---------------------------------------------------------------------------
// Tracks
// ---------------------------------------------------------------------------

const UPSERT_SQL = `
  INSERT INTO tracks (
    id, source, uri, rel_path, title, title_sort, artist, artist_sort,
    album, album_sort, album_artist, album_artist_sort, track_no, disc_no,
    duration_ms, artwork_path, added_at, modified_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    source = excluded.source,
    uri = excluded.uri,
    rel_path = excluded.rel_path,
    title = excluded.title,
    title_sort = excluded.title_sort,
    artist = excluded.artist,
    artist_sort = excluded.artist_sort,
    album = excluded.album,
    album_sort = excluded.album_sort,
    album_artist = excluded.album_artist,
    album_artist_sort = excluded.album_artist_sort,
    track_no = excluded.track_no,
    disc_no = excluded.disc_no,
    duration_ms = excluded.duration_ms,
    artwork_path = excluded.artwork_path,
    modified_at = excluded.modified_at
`;

const UPSERT_CHUNK = 300;

/** Inserts or updates tracks in chunks, each chunk in its own transaction. */
export async function upsertTracks(tracks: Track[]): Promise<void> {
  if (tracks.length === 0) return;
  const db = await getDb();

  for (let offset = 0; offset < tracks.length; offset += UPSERT_CHUNK) {
    const chunk = tracks.slice(offset, offset + UPSERT_CHUNK);
    await db.withTransactionAsync(async () => {
      for (const t of chunk) {
        await db.runAsync(
          UPSERT_SQL,
          t.id,
          t.source,
          t.uri,
          t.relPath ?? null,
          t.title,
          sortKey(t.title),
          t.artist,
          sortKey(t.artist),
          t.album,
          sortKey(t.album),
          t.albumArtist,
          sortKey(t.albumArtist),
          t.trackNo,
          t.discNo,
          t.durationMs,
          t.artworkPath ?? null,
          t.addedAt,
          t.modifiedAt,
        );
      }
    });
  }
}

/**
 * Deletes rows for a source whose id is not in keepIds. Chunked so a 20k-id
 * keep set does not blow past SQLite's variable limit.
 */
export async function deleteTracksNotIn(source: Source, keepIds: string[]): Promise<number> {
  const db = await getDb();

  const existing = await db.getAllAsync<{ id: string }>(
    'SELECT id FROM tracks WHERE source = ?',
    source,
  );
  if (existing.length === 0) return 0;

  const keep = new Set(keepIds);
  const doomed = existing.map((r) => r.id).filter((id) => !keep.has(id));
  if (doomed.length === 0) return 0;

  const DELETE_CHUNK = 300;
  for (let offset = 0; offset < doomed.length; offset += DELETE_CHUNK) {
    const chunk = doomed.slice(offset, offset + DELETE_CHUNK);
    const placeholders = chunk.map(() => '?').join(',');
    await db.runAsync(`DELETE FROM tracks WHERE id IN (${placeholders})`, chunk);
  }

  return doomed.length;
}

/** id -> modified_at, used by the indexer to detect new and changed files. */
export async function getIndexedFiles(source: Source): Promise<Map<string, number>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string; modified_at: number | null }>(
    'SELECT id, modified_at FROM tracks WHERE source = ?',
    source,
  );
  const map = new Map<string, number>();
  for (const r of rows) {
    map.set(r.id, r.modified_at ?? 0);
  }
  return map;
}

/**
 * Artists grouped by album artist, falling back to track artist. Sorted by
 * the precomputed sort key so the SQLite ordering matches the iPod's.
 */
export async function getArtists(): Promise<ArtistRow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    name: string;
    sort_key: string;
    track_count: number;
  }>(`
    SELECT
      COALESCE(NULLIF(album_artist, ''), NULLIF(artist, ''), '${UNKNOWN_ARTIST}') AS name,
      COALESCE(NULLIF(album_artist_sort, ''), NULLIF(artist_sort, ''), '~') AS sort_key,
      COUNT(*) AS track_count
    FROM tracks
    GROUP BY name
    ORDER BY sort_key COLLATE NOCASE ASC, name COLLATE NOCASE ASC
  `);

  return rows.map((r) => ({
    name: r.name,
    sortKey: r.sort_key,
    trackCount: r.track_count,
  }));
}

/** Albums, optionally scoped to one artist. One artwork path per album. */
export async function getAlbums(opts?: { artist?: string }): Promise<AlbumRow[]> {
  const db = await getDb();
  const artist = opts?.artist;

  const sql = `
    SELECT
      COALESCE(NULLIF(album, ''), '${UNKNOWN_ALBUM}') AS name,
      COALESCE(NULLIF(album_artist, ''), NULLIF(artist, ''), '${UNKNOWN_ARTIST}') AS artist,
      COALESCE(NULLIF(album_sort, ''), '~') AS sort_key,
      COUNT(*) AS track_count,
      MAX(artwork_path) AS artwork_path
    FROM tracks
    ${artist ? 'WHERE COALESCE(NULLIF(album_artist, \'\'), NULLIF(artist, \'\'), \'${UNKNOWN_ARTIST}\') = ?' : ''}
    GROUP BY name, artist
    ORDER BY sort_key COLLATE NOCASE ASC, name COLLATE NOCASE ASC
  `;

  const rows = artist
    ? await db.getAllAsync<{
        name: string;
        artist: string;
        sort_key: string;
        track_count: number;
        artwork_path: string | null;
      }>(sql, artist)
    : await db.getAllAsync<{
        name: string;
        artist: string;
        sort_key: string;
        track_count: number;
        artwork_path: string | null;
      }>(sql);

  return rows.map((r) => ({
    name: r.name,
    artist: r.artist,
    sortKey: r.sort_key,
    trackCount: r.track_count,
    artworkPath: r.artwork_path ?? undefined,
  }));
}

/**
 * Light track rows for list screens. Album views sort by disc then track
 * number; every other view sorts by title.
 */
export async function getTracks(opts?: {
  artist?: string;
  album?: string;
  albumArtist?: string;
}): Promise<TrackRow[]> {
  const db = await getDb();

  const where: string[] = [];
  const params: string[] = [];

  if (opts?.artist) {
    where.push(
      `COALESCE(NULLIF(album_artist, ''), NULLIF(artist, ''), '${UNKNOWN_ARTIST}') = ?`,
    );
    params.push(opts.artist);
  }
  if (opts?.albumArtist) {
    where.push(
      `COALESCE(NULLIF(album_artist, ''), NULLIF(artist, ''), '${UNKNOWN_ARTIST}') = ?`,
    );
    params.push(opts.albumArtist);
  }
  if (opts?.album) {
    where.push(`COALESCE(NULLIF(album, ''), '${UNKNOWN_ALBUM}') = ?`);
    params.push(opts.album);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const byAlbum = Boolean(opts?.album);
  const orderSql = byAlbum
    ? 'ORDER BY disc_no ASC, track_no ASC, title_sort COLLATE NOCASE ASC'
    : 'ORDER BY title_sort COLLATE NOCASE ASC, title COLLATE NOCASE ASC';

  const rows = await db.getAllAsync<{
    id: string;
    title: string;
    artist: string;
    album: string;
    duration_ms: number;
  }>(
    `SELECT
       id,
       COALESCE(NULLIF(title, ''), 'Unknown') AS title,
       COALESCE(NULLIF(artist, ''), '${UNKNOWN_ARTIST}') AS artist,
       COALESCE(NULLIF(album, ''), '${UNKNOWN_ALBUM}') AS album,
       COALESCE(duration_ms, 0) AS duration_ms
     FROM tracks
     ${whereSql}
     ${orderSql}`,
    params,
  );

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    artist: r.artist,
    album: r.album,
    durationMs: r.duration_ms,
  }));
}

/** Full rows, only for the tracks actually being queued for playback. */
export async function getTracksByIds(ids: string[]): Promise<Track[]> {
  if (ids.length === 0) return [];
  const db = await getDb();

  const out: Track[] = [];
  const CHUNK = 300;
  for (let offset = 0; offset < ids.length; offset += CHUNK) {
    const chunk = ids.slice(offset, offset + CHUNK);
    const placeholders = chunk.map(() => '?').join(',');
    const rows = await db.getAllAsync<{
      id: string;
      source: string;
      uri: string;
      rel_path: string | null;
      title: string | null;
      artist: string | null;
      album: string | null;
      album_artist: string | null;
      track_no: number | null;
      disc_no: number | null;
      duration_ms: number | null;
      artwork_path: string | null;
      added_at: number | null;
      modified_at: number | null;
    }>(`SELECT * FROM tracks WHERE id IN (${placeholders})`, chunk);

    for (const r of rows) {
      out.push({
        id: r.id,
        source: r.source === 'imported' ? 'imported' : 'mediastore',
        uri: r.uri,
        relPath: r.rel_path ?? undefined,
        title: r.title || 'Unknown',
        artist: r.artist || UNKNOWN_ARTIST,
        album: r.album || UNKNOWN_ALBUM,
        albumArtist: r.album_artist || r.artist || UNKNOWN_ARTIST,
        trackNo: r.track_no ?? 0,
        discNo: r.disc_no ?? 0,
        durationMs: r.duration_ms ?? 0,
        artworkPath: r.artwork_path ?? undefined,
        addedAt: r.added_at ?? 0,
        modifiedAt: r.modified_at ?? 0,
      });
    }
  }

  // Preserve the caller's order (matters for shuffle queues).
  const byId = new Map(out.map((t) => [t.id, t]));
  return ids.map((id) => byId.get(id)).filter((t): t is Track => Boolean(t));
}

/** All track ids, ordered by title. Used for shuffle without loading rows. */
export async function getAllTrackIds(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string }>(
    'SELECT id FROM tracks ORDER BY title_sort COLLATE NOCASE ASC',
  );
  return rows.map((r) => r.id);
}

export async function countTracks(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM tracks');
  return row?.n ?? 0;
}

export async function countArtists(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>(`
    SELECT COUNT(*) AS n FROM (
      SELECT COALESCE(NULLIF(album_artist, ''), NULLIF(artist, ''), '${UNKNOWN_ARTIST}') AS name
      FROM tracks GROUP BY name
    )
  `);
  return row?.n ?? 0;
}

export async function countAlbums(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>(`
    SELECT COUNT(*) AS n FROM (
      SELECT
        COALESCE(NULLIF(album, ''), '${UNKNOWN_ALBUM}') AS name,
        COALESCE(NULLIF(album_artist, ''), NULLIF(artist, ''), '${UNKNOWN_ARTIST}') AS artist
      FROM tracks GROUP BY name, artist
    )
  `);
  return row?.n ?? 0;
}

export async function clearLibrary(): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM tracks');
}

// ---------------------------------------------------------------------------
// Settings (key/value in the same DB, so no extra dependency)
// ---------------------------------------------------------------------------

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string | null }>(
    'SELECT value FROM settings WHERE key = ?',
    key,
  );
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    key,
    value,
  );
}

export async function getSettingNumber(key: string, fallback: number): Promise<number> {
  const raw = await getSetting(key);
  if (raw === null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export async function getSettingBool(key: string, fallback: boolean): Promise<boolean> {
  const raw = await getSetting(key);
  if (raw === null) return fallback;
  return raw === '1' || raw === 'true';
}

export async function setSettingBool(key: string, value: boolean): Promise<void> {
  await setSetting(key, value ? '1' : '0');
}

/** Deterministic artwork filename for an album, so re-scans dedupe. */
export function artworkFilenameFor(album: string, albumArtist: string): string {
  return `${fnvHex(`${album}\u0000${albumArtist}`)}.jpg`;
}
