/**
 * Wheel wiring: the one place the click wheel meets the nav stack.
 *
 * Step   -> menuStack.moveSelection; 'moved' ticks, 'bounced' bounces.
 * Select -> run the selected row's onSelect.
 * Menu   -> pop one frame.
 * Long-press Menu -> pop to root.
 * Next/Prev/Play -> player store stubs.
 */

import { useCallback } from 'react';

import { bounce, click, tick } from '../haptics/haptics';
import { getSelectedRow, useMenuStore } from '../nav/menuStack';
import { usePlayerStore } from '../player/store';
import type { Zone } from '../wheel/useClickWheel';

/** One wheel step changes volume by this fraction (0.0..1.0). */
const VOLUME_STEP = 0.05;

/** Consecutive-step gating for wheel acceleration. */
const FAST_TICK_MS = 40;
const FAST_TICKS_3X = 6;
const FAST_TICKS_8X = 12;
/** Lists at or below this length never accelerate. */
const MIN_ITEMS_TO_ACCELERATE = 50;
/** Frames whose rows are ordered by label, so the A-Z jump HUD is meaningful. */
const ALPHABETICAL_FRAME_IDS = new Set(['songs', 'artists', 'albums']);

/**
 * Consecutive fast ticks, module-level on purpose: this is input timing, not
 * render state, and it must not cause a re-render when it changes.
 */
let lastStepAt = 0;
let fastRun = 0;

/**
 * Returns how many rows this tick should move. A spinner (< 40 ms between
 * ticks) ramps 1x -> 3x after 6 ticks -> 8x after 12. Any slower tick resets
 * to 1x immediately.
 */
function stepMultiplier(now: number, itemCount: number): number {
  if (itemCount <= MIN_ITEMS_TO_ACCELERATE) {
    fastRun = 0;
    lastStepAt = now;
    return 1;
  }

  const dt = lastStepAt === 0 ? Number.POSITIVE_INFINITY : now - lastStepAt;
  lastStepAt = now;
  fastRun = dt < FAST_TICK_MS ? fastRun + 1 : 0;

  if (fastRun >= FAST_TICKS_8X) return 8;
  if (fastRun >= FAST_TICKS_3X) return 3;
  return 1;
}

/** A-Z for letters, '#' for digits/symbols, matching the iPod index bands. */
function jumpLetterFor(label: string): string {
  const first = label.trim().charAt(0).toUpperCase();
  return first >= 'A' && first <= 'Z' ? first : '#';
}

export function useWheelNav() {
  const onStep = useCallback((dir: 1 | -1) => {
    const menu = useMenuStore.getState();
    const top = menu.stack[menu.stack.length - 1];
    const player = usePlayerStore.getState();

    // On the Now Playing screen the wheel controls volume (Phase 4) instead of
    // moving a menu selection.
    if (top?.kind === 'nowplaying' && player.current) {
      const next = Math.min(1, Math.max(0, player.volume + dir * VOLUME_STEP));
      player.setVolume(next);
      tick();
      return;
    }

    const multiplier = stepMultiplier(Date.now(), top?.items.length ?? 0);
    const result = menu.moveSelectionBy(dir, multiplier);
    if (result === 'moved') {
      tick();
    } else {
      bounce();
    }

    // Alphabet jump HUD: only while the wheel is spinning fast on a list that
    // is sorted by label. The store hides it again 600 ms after the last step.
    if (multiplier > 1 && top && ALPHABETICAL_FRAME_IDS.has(top.id)) {
      const current = useMenuStore.getState().stack.slice(-1)[0];
      const row = current?.items[current.selectedIndex];
      if (row) menu.showJump(jumpLetterFor(row.label));
    } else {
      menu.hideJump();
    }
  }, []);

  const onTap = useCallback((zone: Zone) => {
    const menu = useMenuStore.getState();
    const player = usePlayerStore.getState();

    switch (zone) {
      case 'select': {
        click();
        const row = getSelectedRow();
        if (!row || row.disabled) return;
        row.onSelect?.();
        break;
      }
      case 'menu': {
        click();
        menu.pop();
        break;
      }
      case 'next': {
        click();
        player.next();
        break;
      }
      case 'prev': {
        click();
        player.prev();
        break;
      }
      case 'play': {
        click();
        player.togglePlay();
        break;
      }
    }
  }, []);

  // Long-press MENU: same click feedback as a short press, then jump to the
  // root menu (a no-op on the root itself, but still audible).
  const onMenuLongPress = useCallback(() => {
    click();
    useMenuStore.getState().popToRoot();
  }, []);

  return { onStep, onTap, onMenuLongPress };
}
