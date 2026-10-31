/**
 * Base64 sizing for artwork caps.
 *
 * Pure and dependency-free so it can be exercised by scripts/check-pure.ts
 * without pulling in React Native or expo modules.
 */

/**
 * Number of decoded bytes a base64 string represents, without decoding it.
 *
 * Handles a `data:` prefix and embedded whitespace (both are legal in tag
 * payloads). Invalid input still returns a number: the caller only uses this to
 * decide "too big to keep", so over-estimating is harmless.
 */
export function base64ByteLength(base64: string): number {
  if (!base64) return 0;

  const withoutPrefix = base64.replace(/^data:[^,]*;base64,/i, '');
  const clean = withoutPrefix.replace(/\s+/g, '');
  if (clean.length === 0) return 0;

  let padding = 0;
  if (clean.endsWith('==')) padding = 2;
  else if (clean.endsWith('=')) padding = 1;

  return Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
}
