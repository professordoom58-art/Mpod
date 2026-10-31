/**
 * Pure scroll-window math for the LCD list. Kept separate from the component
 * so it can be unit-tested without a renderer.
 */

/**
 * Returns the window start that keeps `selectedIndex` visible while moving the
 * window as little as possible. This is the iPod behaviour: the highlight
 * travels down the visible rows and the window only shifts once it would run
 * off the bottom (or top) edge.
 */
export function computeWindow(
  selectedIndex: number,
  windowStart: number,
  visibleRows: number,
  total: number,
): number {
  if (total <= 0) return 0;

  const rows = Math.max(1, Math.floor(visibleRows));
  if (total <= rows) return 0;

  const selected = Math.min(Math.max(selectedIndex, 0), total - 1);
  const maxStart = total - rows;

  let start = Math.min(Math.max(windowStart, 0), maxStart);

  if (selected < start) {
    start = selected;
  } else if (selected >= start + rows) {
    start = selected - rows + 1;
  }

  return Math.min(Math.max(start, 0), maxStart);
}

/** Number of rows that fit in a given height. Always at least 1. */
export function visibleRowCount(bodyHeight: number, rowHeight: number): number {
  if (rowHeight <= 0) return 1;
  return Math.max(1, Math.floor(bodyHeight / rowHeight));
}
