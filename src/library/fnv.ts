/**
 * 32-bit FNV-1a. Used for stable, dependency-free ids and artwork filenames.
 *
 * Not cryptographic and never used for security: it only has to be stable
 * across launches and cheap enough to run over 20k filenames.
 */

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** Returns the hash as an unsigned 32-bit integer. */
export function fnv1a32(input: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    // Multiply by the FNV prime with 32-bit wraparound.
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}

/** Returns the hash as 8 lowercase hex characters. */
export function fnvHex(input: string): string {
  return fnv1a32(input).toString(16).padStart(8, '0');
}
