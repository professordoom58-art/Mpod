/**
 * The navigation stack. This is the whole "where am I" model: a stack of
 * frames, each with its own selection and scroll position, so popping back
 * restores exactly where you were.
 *
 * Components subscribe with selectors. A wheel step touches only the top
 * frame, so only the list re-renders, never the whole app.
 */

import { create } from 'zustand';

import { computeWindow } from '../ui/windowing';
import { timing } from '../ui/theme';

export type FrameKind =
  | 'menu'
  | 'list'
  | 'progress'
  | 'message'
  | 'nowplaying'
  | 'settings'
  /** 3D Cover Flow carousel (Albums). */
  | 'coverflow';

export type Row = {
  id: string;
  label: string;
  sub?: string;
  chevron?: boolean;
  disabled?: boolean;
  /** Album art for cover-flow rows, relative to the document directory. */
  artworkPath?: string;
  onSelect?: () => void;
};

/**
 * The album tracklist card that a Cover Flow card flips into. It lives on the
 * cover-flow frame (not a pushed frame) because MENU must flip it closed rather
 * than leave the carousel, and because the wheel keeps driving its selection.
 */
export type AlbumOverlay = {
  /** Row id of the album this was opened from, so a stale loader can bail. */
  sourceId: string;
  title: string;
  sub?: string;
  artworkPath?: string;
  items: Row[];
  selectedIndex: number;
  loading: boolean;
};

export type Frame = {
  id: string;
  title: string;
  kind: FrameKind;
  /** Present while a Cover Flow album card is flipped open. */
  albumOverlay?: AlbumOverlay;
  /** Resolved rows. Empty while a loader is pending. */
  items: Row[];
  /** Present while an async loader is in flight. */
  loading: boolean;
  selectedIndex: number;
  windowStart: number;
  /** Rows visible on screen, supplied by the renderer each layout pass. */
  visibleRows: number;
  /** Optional bottom status line (progress text, messages). */
  status?: string;
};

export type MoveResult = 'moved' | 'bounced';

export type PushFrameInput = {
  id: string;
  title: string;
  kind?: FrameKind;
  items?: Row[];
  loader?: () => Promise<Row[]>;
  status?: string;
  /** Start on this row instead of 0 (used to land on the current album). */
  initialIndex?: number;
};

type MenuState = {
  stack: Frame[];
  /** Letter shown by the accelerated-scroll HUD, or null when hidden. */
  jumpLetter: string | null;
  push: (input: PushFrameInput) => void;
  pop: () => boolean;
  popToRoot: () => boolean;
  moveSelection: (dir: 1 | -1) => MoveResult;
  /**
   * Moves by `steps` rows in one state update. Used by wheel acceleration so a
   * 8x tick does not re-render the list eight times.
   */
  moveSelectionBy: (dir: 1 | -1, steps: number) => MoveResult;
  setVisibleRows: (rows: number) => void;
  setStatus: (status: string | undefined) => void;
  replaceTopItems: (items: Row[]) => void;
  updateFrameItems: (id: string, items: Row[]) => void;
  /** Flips the selected Cover Flow album open into its tracklist card. */
  openAlbumOverlay: (input: {
    sourceId: string;
    title: string;
    sub?: string;
    artworkPath?: string;
  }) => void;
  /** Fills in the track rows once the album's tracks have loaded. */
  setAlbumOverlayItems: (sourceId: string, items: Row[]) => void;
  /** Flips the tracklist card closed. Returns false when none was open. */
  closeAlbumOverlay: () => boolean;
  /** Replaces the bottom (root) frame's rows without disturbing depth. */
  replaceRootItems: (items: Row[]) => void;
  showJump: (letter: string) => void;
  hideJump: () => void;
  reset: (root: PushFrameInput) => void;
};

let jumpTimer: ReturnType<typeof setTimeout> | null = null;

const ROOT_ID = 'root';

let frameCounter = 0;
function nextFrameId(prefix: string): string {
  frameCounter += 1;
  return `${prefix}-${frameCounter}`;
}

function makeFrame(input: PushFrameInput): Frame {
  const items = input.items ?? [];
  const visibleRows = 6;
  const initialIndex = Math.min(
    Math.max(input.initialIndex ?? 0, 0),
    Math.max(0, items.length - 1),
  );

  return {
    id: input.id || nextFrameId('frame'),
    title: input.title,
    kind: input.kind ?? 'menu',
    items,
    loading: Boolean(input.loader),
    selectedIndex: initialIndex,
    windowStart: computeWindow(initialIndex, 0, visibleRows, items.length),
    visibleRows,
    status: input.status,
  };
}

/** Recomputes the window for the top frame after a selection change. */
function withWindow(frame: Frame, selectedIndex: number): Frame {
  const clamped = Math.min(Math.max(selectedIndex, 0), Math.max(0, frame.items.length - 1));
  return {
    ...frame,
    selectedIndex: clamped,
    windowStart: computeWindow(
      clamped,
      frame.windowStart,
      frame.visibleRows,
      frame.items.length,
    ),
  };
}

export const useMenuStore = create<MenuState>((set, get) => ({
  stack: [],
  jumpLetter: null,

  showJump: (letter) => {
    if (jumpTimer) clearTimeout(jumpTimer);
    // Only touch subscribers when the letter actually changes, so an 8x spin
    // through one letter does not re-render the HUD every tick.
    if (get().jumpLetter !== letter) set({ jumpLetter: letter });
    jumpTimer = setTimeout(() => {
      jumpTimer = null;
      set({ jumpLetter: null });
    }, timing.jumpHudMs);
  },

  hideJump: () => {
    if (jumpTimer) {
      clearTimeout(jumpTimer);
      jumpTimer = null;
    }
    if (get().jumpLetter !== null) set({ jumpLetter: null });
  },

  reset: (root) => {
    set({ stack: [makeFrame({ ...root, id: root.id || ROOT_ID })] });
  },

  push: (input) => {
    const frame = makeFrame(input);
    set((state) => ({ stack: [...state.stack, frame] }));

    // Resolve the loader after the frame is on screen, so "Loading..." shows.
    if (input.loader) {
      const loader = input.loader;
      const frameId = frame.id;
      void (async () => {
        try {
          const items = await loader();
          set((state) => ({
            stack: state.stack.map((f) =>
              f.id === frameId
                ? {
                    ...f,
                    items,
                    loading: false,
                    selectedIndex: Math.min(f.selectedIndex, Math.max(0, items.length - 1)),
                    windowStart: computeWindow(
                      Math.min(f.selectedIndex, Math.max(0, items.length - 1)),
                      0,
                      f.visibleRows,
                      items.length,
                    ),
                  }
                : f,
            ),
          }));
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          set((state) => ({
            stack: state.stack.map((f) =>
              f.id === frameId
                ? {
                    ...f,
                    loading: false,
                    items: [{ id: 'error', label: 'Could not load', sub: message }],
                  }
                : f,
            ),
          }));
        }
      })();
    }
  },

  pop: () => {
    const { stack } = get();
    if (stack.length === 0) return false;
    const top = stack[stack.length - 1];
    // A flipped-open tracklist card is the topmost "screen": MENU closes it
    // instead of leaving Cover Flow.
    if (top.albumOverlay) {
      set({ stack: [...stack.slice(0, -1), { ...top, albumOverlay: undefined }] });
      return true;
    }
    if (stack.length <= 1) return false;
    set({ stack: stack.slice(0, -1) });
    return true;
  },

  popToRoot: () => {
    const { stack } = get();
    if (stack.length <= 1) return false;
    set({ stack: stack.slice(0, 1) });
    return true;
  },

  moveSelection: (dir) => get().moveSelectionBy(dir, 1),

  moveSelectionBy: (dir, steps) => {
    const { stack } = get();
    if (stack.length === 0) return 'bounced';

    const top = stack[stack.length - 1];
    if (top.loading) return 'bounced';

    const count = Math.max(1, Math.trunc(steps));

    // While an album's tracklist card is flipped open, the wheel scrolls the
    // track rows, not the albums behind them.
    const overlay = top.albumOverlay;
    if (overlay) {
      if (overlay.loading || overlay.items.length === 0) return 'bounced';
      const next = Math.min(
        Math.max(overlay.selectedIndex + dir * count, 0),
        overlay.items.length - 1,
      );
      if (next === overlay.selectedIndex) return 'bounced';
      set({
        stack: [
          ...stack.slice(0, -1),
          { ...top, albumOverlay: { ...overlay, selectedIndex: next } },
        ],
      });
      return 'moved';
    }

    if (top.items.length === 0) return 'bounced';
    const next = Math.min(
      Math.max(top.selectedIndex + dir * count, 0),
      top.items.length - 1,
    );
    if (next === top.selectedIndex) return 'bounced';

    const updated = withWindow(top, next);
    set({ stack: [...stack.slice(0, -1), updated] });
    return 'moved';
  },

  setVisibleRows: (rows) => {
    const { stack } = get();
    if (stack.length === 0) return;
    const top = stack[stack.length - 1];
    if (top.visibleRows === rows) return;

    const updated: Frame = {
      ...top,
      visibleRows: rows,
      windowStart: computeWindow(top.selectedIndex, top.windowStart, rows, top.items.length),
    };
    set({ stack: [...stack.slice(0, -1), updated] });
  },

  setStatus: (status) => {
    const { stack } = get();
    if (stack.length === 0) return;
    const top = stack[stack.length - 1];
    if (top.status === status) return;
    set({ stack: [...stack.slice(0, -1), { ...top, status }] });
  },

  replaceRootItems: (items) => {
    const { stack } = get();
    if (stack.length === 0) return;
    const root = stack[0];
    const selectedIndex = Math.min(root.selectedIndex, Math.max(0, items.length - 1));
    set({
      stack: [
        {
          ...root,
          items,
          loading: false,
          selectedIndex,
          windowStart: computeWindow(selectedIndex, 0, root.visibleRows, items.length),
        },
        ...stack.slice(1),
      ],
    });
  },

  /**
   * Rebuilds one frame's rows in place, wherever it sits in the stack, keeping
   * its selection. Lets a child screen refresh a parent's summary labels (e.g.
   * the Settings row naming the active theme) without popping.
   */
  updateFrameItems: (id, items) => {
    const { stack } = get();
    const index = stack.findIndex((f) => f.id === id);
    if (index < 0) return;
    const frame = stack[index];
    const selectedIndex = Math.min(frame.selectedIndex, Math.max(0, items.length - 1));
    set({
      stack: stack.map((f, i) =>
        i === index
          ? {
              ...f,
              items,
              loading: false,
              selectedIndex,
              windowStart: computeWindow(selectedIndex, 0, f.visibleRows, items.length),
            }
          : f,
      ),
    });
  },

  openAlbumOverlay: (input) => {
    const { stack } = get();
    if (stack.length === 0) return;
    const top = stack[stack.length - 1];
    if (top.kind !== 'coverflow') return;
    set({
      stack: [
        ...stack.slice(0, -1),
        {
          ...top,
          albumOverlay: {
            sourceId: input.sourceId,
            title: input.title,
            sub: input.sub,
            artworkPath: input.artworkPath,
            items: [],
            selectedIndex: 0,
            loading: true,
          },
        },
      ],
    });
  },

  setAlbumOverlayItems: (sourceId, items) => {
    const { stack } = get();
    if (stack.length === 0) return;
    const top = stack[stack.length - 1];
    const overlay = top.albumOverlay;
    // Ignore a late loader for an album the user already flipped away from.
    if (!overlay || overlay.sourceId !== sourceId) return;
    set({
      stack: [
        ...stack.slice(0, -1),
        {
          ...top,
          albumOverlay: {
            ...overlay,
            items,
            selectedIndex: Math.min(overlay.selectedIndex, Math.max(0, items.length - 1)),
            loading: false,
          },
        },
      ],
    });
  },

  closeAlbumOverlay: () => {
    const { stack } = get();
    if (stack.length === 0) return false;
    const top = stack[stack.length - 1];
    if (!top.albumOverlay) return false;
    set({ stack: [...stack.slice(0, -1), { ...top, albumOverlay: undefined }] });
    return true;
  },

  replaceTopItems: (items) => {
    const { stack } = get();
    if (stack.length === 0) return;
    const top = stack[stack.length - 1];
    const selectedIndex = Math.min(top.selectedIndex, Math.max(0, items.length - 1));
    set({
      stack: [
        ...stack.slice(0, -1),
        {
          ...top,
          items,
          loading: false,
          selectedIndex,
          windowStart: computeWindow(selectedIndex, 0, top.visibleRows, items.length),
        },
      ],
    });
  },
}));

// --- Selectors -------------------------------------------------------------
// Subscribing through these keeps re-renders scoped to what changed.

export const selectTop = (s: MenuState): Frame | undefined => s.stack[s.stack.length - 1];
export const selectDepth = (s: MenuState): number => s.stack.length;
export const selectTopItems = (s: MenuState): Row[] =>
  s.stack.length > 0 ? s.stack[s.stack.length - 1].items : EMPTY_ROWS;
export const selectTopSelectedIndex = (s: MenuState): number =>
  s.stack.length > 0 ? s.stack[s.stack.length - 1].selectedIndex : 0;
export const selectTopWindowStart = (s: MenuState): number =>
  s.stack.length > 0 ? s.stack[s.stack.length - 1].windowStart : 0;
export const selectTopTitle = (s: MenuState): string =>
  s.stack.length > 0 ? s.stack[s.stack.length - 1].title : '';
export const selectTopLoading = (s: MenuState): boolean =>
  s.stack.length > 0 ? s.stack[s.stack.length - 1].loading : false;
export const selectTopStatus = (s: MenuState): string | undefined =>
  s.stack.length > 0 ? s.stack[s.stack.length - 1].status : undefined;
export const selectTopKind = (s: MenuState): FrameKind =>
  s.stack.length > 0 ? s.stack[s.stack.length - 1].kind : 'menu';
export const selectTopAlbumOverlay = (s: MenuState): AlbumOverlay | undefined =>
  s.stack.length > 0 ? s.stack[s.stack.length - 1].albumOverlay : undefined;
export const selectJumpLetter = (s: MenuState): string | null => s.jumpLetter;

const EMPTY_ROWS: Row[] = [];

/** The currently selected row, or undefined when the list is empty. */
export function getSelectedRow(): Row | undefined {
  const { stack } = useMenuStore.getState();
  if (stack.length === 0) return undefined;
  const top = stack[stack.length - 1];
  if (top.albumOverlay) {
    const overlay = top.albumOverlay;
    return overlay.items[overlay.selectedIndex];
  }
  return top.items[top.selectedIndex];
}
