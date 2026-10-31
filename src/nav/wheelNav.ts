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

export function useWheelNav() {
  const onStep = useCallback((dir: 1 | -1) => {
    // On the Now Playing screen the wheel controls volume (Phase 4) instead of
    // moving a menu selection.
    const kind = useMenuStore.getState().stack.slice(-1)[0]?.kind;
    const player = usePlayerStore.getState();

    if (kind === 'nowplaying' && player.current) {
      const next = Math.min(1, Math.max(0, player.volume + dir * VOLUME_STEP));
      player.setVolume(next);
      tick();
      return;
    }

    const result = useMenuStore.getState().moveSelection(dir);
    if (result === 'moved') {
      tick();
    } else {
      bounce();
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

  const onMenuLongPress = useCallback(() => {
    useMenuStore.getState().popToRoot();
  }, []);

  return { onStep, onTap, onMenuLongPress };
}
