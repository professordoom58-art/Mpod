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

export type FrameKind =
  | 'menu'
  | 'list'
  | 'progress'
  | 'message'
  | 'nowplaying'
  | 'settings';

export type Row = {
  id: string;
  label: string;
  sub?: string;
  chevron?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
};

export type Frame = {
  id: string;
  title: string;
  kind: FrameKind;
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
  push: (input: PushFrameInput) => void;
  pop: () => boolean;
  popToRoot: () => boolean;
  moveSelection: (dir: 1 | -1) => MoveResult;
  setVisibleRows: (rows: number) => void;
  setStatus: (status: string | undefined) => void;
  replaceTopItems: (items: Row[]) => void;
  reset: (root: PushFrameInput) => void;
};

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

  moveSelection: (dir) => {
    const { stack } = get();
    if (stack.length === 0) return 'bounced';

    const top = stack[stack.length - 1];
    if (top.loading || top.items.length === 0) return 'bounced';

    const next = top.selectedIndex + dir;
    if (next < 0 || next > top.items.length - 1) {
      return 'bounced';
    }

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

const EMPTY_ROWS: Row[] = [];

/** The currently selected row, or undefined when the list is empty. */
export function getSelectedRow(): Row | undefined {
  const { stack } = useMenuStore.getState();
  if (stack.length === 0) return undefined;
  const top = stack[stack.length - 1];
  return top.items[top.selectedIndex];
}
