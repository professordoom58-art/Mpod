/**
 * The ONLY file allowed to import expo-haptics.
 *
 * Verified against the installed expo-haptics 58.0.7 typings:
 *   - Haptics.performAndroidHapticsAsync(type: AndroidHaptics): Promise<void>
 *   - AndroidHaptics.Clock_Tick = 'clock-tick'
 *   - AndroidHaptics.Context_Click = 'context-click'
 *   - AndroidHaptics.Segment_Tick = 'segment-tick'
 *   - AndroidHaptics.Long_Press = 'long-press'
 *   - AndroidHaptics.Reject = 'reject'          <-- used by bounce()
 *   - Haptics.selectionAsync(), Haptics.impactAsync(ImpactFeedbackStyle.*)
 * All of the above exist in the installed version, so no fallback is needed.
 */

import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/** Minimum ms between tick() calls. */
export const TICK_MIN_INTERVAL_MS = 25;

let lastTickAt = 0;
let enabled = true;

/** Global switch, wired to Settings > Haptics. */
export function setHapticsEnabled(next: boolean): void {
  enabled = next;
}

export function isHapticsEnabled(): boolean {
  return enabled;
}

/**
 * Fire-and-forget wrapper. expo-haptics returns promises; we never await them
 * on the gesture path, but we do swallow rejections so an unsupported device
 * cannot produce an unhandled rejection.
 */
function fire(p: Promise<void>): void {
  void p.catch(() => {
    /* device has no haptics engine, or the call was interrupted */
  });
}

/**
 * One wheel step. Rate-limited to TICK_MIN_INTERVAL_MS so a fast spin does not
 * queue hundreds of motor calls.
 */
export function tick(): void {
  if (!enabled) return;
  const now = Date.now();
  if (now - lastTickAt < TICK_MIN_INTERVAL_MS) return;
  lastTickAt = now;

  if (Platform.OS === 'android') {
    fire(Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Clock_Tick));
    return;
  }
  fire(Haptics.selectionAsync());
}

/** A committed action: Select, Menu, Play/Pause, Next, Prev. */
export function click(): void {
  if (!enabled) return;
  lastTickAt = Date.now();

  if (Platform.OS === 'android') {
    fire(Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Context_Click));
    return;
  }
  fire(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

/**
 * Distinct feedback for hitting the top or bottom of a list. Deliberately not
 * rate-limited: it fires at most once per step, and it must always be felt.
 *
 * Android uses Reject, which is a genuinely different waveform from the tick,
 * so the edge is unmistakable. iOS uses a heavy impact as the nearest analogue.
 */
export function bounce(): void {
  if (!enabled) return;
  lastTickAt = Date.now();

  if (Platform.OS === 'android') {
    fire(Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Reject));
    return;
  }
  fire(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
}

/** Long-press Menu (jump to main menu). Heavier than a click. */
export function longPress(): void {
  if (!enabled) return;
  lastTickAt = Date.now();

  if (Platform.OS === 'android') {
    fire(Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Long_Press));
    return;
  }
  fire(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
}
