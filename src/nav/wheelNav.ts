/**
 * Wheel wiring: the one place the click wheel meets the nav stack.
 *
 * Step   -> menuStack.moveSelection; 'moved' ticks, 'bounced' bounces.
 * Select -> run the selected row's onSelect.
 * Menu   -> pop one frame.
 * Long-press Menu -> pop to root.
 * Next/Prev tap  -> player next/prev.
 * Next/Prev hold -> fast-forward / rewind inside the current track.
 * Play   -> player togglePlay.
 *
 * Fast-forward / rewind (Feature 2):
 *   - the gesture layer reports only "hold started" and "released";
 *   - the repeat loop lives here, on the JS thread, because timers cannot run
 *     in a Reanimated worklet;
 *   - one tick every `timing.seekRepeatMs` (200 ms), jumping `seekStepMs` (3 s)
 *     for the first `seekAccelAfterMs` (2 s) of the hold and `seekStepFastMs`
 *     (6 s) after that;
 *   - release clears the interval immediately and never advances the queue.
 *
 * The loop state is module-level on purpose: it is input timing, not render
 * state, and it must not cause a re-render when it starts or stops.
 */

import { useCallback } from 'react';

import { bounce, click, tick } from '../haptics/haptics';
import { getSelectedRow, useMenuStore } from '../nav/menuStack';
import { usePlayerStore } from '../player/store';
import { timing } from '../ui/theme';
import type { SeekZone, Zone } from '../wheel/useClickWheel';

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

/** Active seek loop. null when the wheel buttons are not being held. */
let seekTimer: ReturnType<typeof setInterval> | null = null;
/** Where the seek loop has got to, so it does not fight the 4 Hz status tick. */
let seekTargetMs = 0;

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

/** Cancels a running seek loop. Safe to call when nothing is running. */
function stopSeek(): void {
  if (seekTimer !== null) {
    clearInterval(seekTimer);
    seekTimer = null;
  }
}

/**
 * Starts the fast-forward (next) / rewind (prev) loop.
 *
 * The accumulator is seeded from the store's position and then advanced
 * locally, so a lagging 250 ms status update cannot make the seek stutter or
 * jump backwards. Every repeat is clamped to [0, duration].
 */
function startSeek(zone: SeekZone): void {
  stopSeek();

  const player = usePlayerStore.getState();
  if (!player.current) return;

  // One click at the moment the hold becomes a seek, like the real wheel.
  click();

  const dir: 1 | -1 = zone === 'next' ? 1 : -1;
  const startedAt = Date.now();
  seekTargetMs = player.positionMs;

  seekTimer = setInterval(() => {
    const s = usePlayerStore.getState();
    if (!s.current) {
      stopSeek();
      return;
    }

    const heldMs = Date.now() - startedAt;
    const step =
      heldMs >= timing.seekAccelAfterMs ? timing.seekStepFastMs : timing.seekStepMs;
    const limit = s.durationMs > 0 ? s.durationMs : Number.POSITIVE_INFINITY;

    seekTargetMs = Math.max(0, Math.min(limit, seekTargetMs + dir * step));
    s.seek(seekTargetMs);
    tick();

    // Nothing left to seek to at either end of the track.
    if (seekTargetMs <= 0 || (Number.isFinite(limit) && seekTargetMs >= limit)) {
      stopSeek();
    }
  }, timing.seekRepeatMs);
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
      // On Cover Flow the side buttons step through albums instead of
      // skipping tracks, like the real device.
      case 'next': {
        if (menu.stack[menu.stack.length - 1]?.kind === 'coverflow') {
          const result = menu.moveSelectionBy(1, 1);
          if (result === 'moved') tick();
          else bounce();
          break;
        }
        click();
        player.next();
        break;
      }
      case 'prev': {
        if (menu.stack[menu.stack.length - 1]?.kind === 'coverflow') {
          const result = menu.moveSelectionBy(-1, 1);
          if (result === 'moved') tick();
          else bounce();
          break;
        }
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

  // Hold NEXT/PREV: start the seek loop. The gesture layer guarantees a tap
  // and a hold are mutually exclusive, so no track skip follows a hold.
  const onSeekStart = useCallback((zone: SeekZone) => {
    startSeek(zone);
  }, []);

  const onSeekEnd = useCallback(() => {
    stopSeek();
  }, []);

  return { onStep, onTap, onMenuLongPress, onSeekStart, onSeekEnd };
}
