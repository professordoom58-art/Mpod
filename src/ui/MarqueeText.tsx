/**
 * Single-line text that scrolls horizontally when it is too long for its
 * container: pause 1.2 s, scroll left at a constant speed, pause, then snap
 * back and repeat. Used for the highlighted menu row and the Now Playing
 * title, mirroring the iPod's marquee behaviour.
 *
 * Deliberately dependency-free beyond Reanimated, and cheap: one shared value
 * per instance, one UI-thread animation, no JS-thread ticks. The animation
 * restarts whenever `text` changes (a new selection or track), which is what
 * "reset on selection/track change" means.
 *
 * Text width is estimated from the font size and character count rather than
 * measured, because a `numberOfLines={1}` Text reports its clipped width and
 * cannot be used to detect overflow reliably.
 */

import { useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type TextStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { timing } from './theme';

/** Strings at or below this length never scroll, even if they barely fit. */
const MIN_MARQUEE_CHARS = 26;
/** Rough advance width of one character, as a fraction of the font size. */
const CHAR_WIDTH_RATIO = 0.58;

type Props = {
  text: string;
  style?: StyleProp<TextStyle>;
  /** Alignment while the text fits; scrolling always starts at the left. */
  align?: 'left' | 'center';
  /** Optional fixed height. Defaults to ~1.35 line heights of `style.fontSize`. */
  height?: number;
};

export function MarqueeText({ text, style, align = 'left', height }: Props) {
  const [containerWidth, setContainerWidth] = useState(0);
  const offset = useSharedValue(0);

  const fontSize = StyleSheet.flatten(style)?.fontSize ?? 13;
  const boxHeight = height ?? fontSize * 1.35;
  const estimatedWidth = text.length * fontSize * CHAR_WIDTH_RATIO;
  const overflows =
    text.length > MIN_MARQUEE_CHARS && containerWidth > 0 && estimatedWidth > containerWidth;

  // A centred short string is positioned by hand; a scrolling one starts left.
  const baseLeft = align === 'center' && !overflows ? Math.max(0, (containerWidth - estimatedWidth) / 2) : 0;

  useEffect(() => {
    cancelAnimation(offset);
    offset.value = 0;
    if (!overflows) return;

    const distance = estimatedWidth - containerWidth;
    const duration = Math.max(500, Math.round((distance / timing.marqueeSpeed) * 1000));

    offset.value = withRepeat(
      withSequence(
        withDelay(
          timing.marqueePauseMs,
          withTiming(-distance, { duration, easing: Easing.linear }),
        ),
        withDelay(timing.marqueePauseMs, withTiming(0, { duration: 0 })),
      ),
      -1,
      false,
    );

    return () => {
      cancelAnimation(offset);
    };
  }, [overflows, estimatedWidth, containerWidth, text, offset]);

  const animatedStyle = useAnimatedStyle(
    () => ({ transform: [{ translateX: offset.value + baseLeft }] }),
    [baseLeft],
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const next = e.nativeEvent.layout.width;
    if (next !== containerWidth) setContainerWidth(next);
  };

  return (
    <View style={[styles.clip, { height: boxHeight }]} onLayout={onLayout}>
      <Animated.View style={[styles.slider, animatedStyle]}>
        <Animated.Text numberOfLines={1} style={style}>
          {text}
        </Animated.Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    alignSelf: 'stretch',
    overflow: 'hidden',
  },
  slider: {
    // `left` only (no `right`/width) keeps the text at its intrinsic width so
    // it is clipped by the parent instead of ellipsized.
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
});
