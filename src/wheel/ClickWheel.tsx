/**
 * Static SVG click wheel. Purely visual: no touch handling here.
 * The gesture is attached by the parent via GestureDetector wrapping this view,
 * so the wheel's own SVG children never intercept touches.
 *
 * Note: GestureDetector's child must be a native view. A plain <View> wrapper
 * is used rather than <Svg>, because Svg children can swallow pointer events
 * on some Android versions.
 *
 * Depth is entirely react-native-svg:
 *   - the outer face carries a radial gradient so the wheel reads as a
 *     recessed disc rather than a flat circle;
 *   - an inner shadow ring darkens the rim where it meets the chassis;
 *   - the center Select button is CONCAVE: a radial gradient that is light at
 *     the rim and darker in the middle, the inverse of a raised button.
 * No Platform branching.
 */

import { StyleSheet, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

import { colors, layout } from '../ui/theme';

type Props = {
  /** Outer diameter in points. */
  size: number;
  /** Center button diameter as a ratio of size. */
  innerRatio?: number;
  /** Draws the four labels. */
  showLabels?: boolean;
  /**
   * Case tint for the concave Select button: `light` is the lit rim, `dark`
   * the recessed middle. Defaults to the silver finish.
   */
  center?: { light: string; dark: string };
};

const DEFAULT_CENTER = { light: '#ECEFF3', dark: '#DCE1E7' } as const;

/** Crisp label ink, per the iPod Classic wheel. */
const LABEL_COLOR = '#858D99';

/** Scaled coordinate helpers: draw in a ~±5 unit space, scale by `k`. */
const k = (labelSize: number) => labelSize / 11;

/** Previous Track `|◀◀`: vertical bar + two left-pointing triangles. */
function PrevGlyph({ cx, cy, color, labelSize }: { cx: number; cy: number; color: string; labelSize: number }) {
  const s = k(labelSize);
  return (
    <G>
      <Rect x={cx - 9 * s} y={cy - 4.5 * s} width={1.7 * s} height={9 * s} rx={0.8 * s} fill={color} />
      <Path d={`M${cx - 1.5 * s} ${cy - 4.5 * s} L${cx - 1.5 * s} ${cy + 4.5 * s} L${cx - 5.5 * s} ${cy} Z`} fill={color} />
      <Path d={`M${cx + 3 * s} ${cy - 4.5 * s} L${cx + 3 * s} ${cy + 4.5 * s} L${cx - 1 * s} ${cy} Z`} fill={color} />
    </G>
  );
}

/** Next Track `▶▶|`: two right-pointing triangles + vertical bar. */
function NextGlyph({ cx, cy, color, labelSize }: { cx: number; cy: number; color: string; labelSize: number }) {
  const s = k(labelSize);
  return (
    <G>
      <Rect x={cx + 7.3 * s} y={cy - 4.5 * s} width={1.7 * s} height={9 * s} rx={0.8 * s} fill={color} />
      <Path d={`M${cx + 1.5 * s} ${cy - 4.5 * s} L${cx + 1.5 * s} ${cy + 4.5 * s} L${cx + 5.5 * s} ${cy} Z`} fill={color} />
      <Path d={`M${cx - 3 * s} ${cy - 4.5 * s} L${cx - 3 * s} ${cy + 4.5 * s} L${cx + 1 * s} ${cy} Z`} fill={color} />
    </G>
  );
}

/** Play/Pause `▶ ||`: a play triangle followed by two pause bars. */
function PlayPauseGlyph({ cx, cy, color, labelSize }: { cx: number; cy: number; color: string; labelSize: number }) {
  const s = k(labelSize);
  return (
    <G>
      <Path d={`M${cx - 4.5 * s} ${cy - 4.5 * s} L${cx - 4.5 * s} ${cy + 4.5 * s} L${cx + 2.5 * s} ${cy} Z`} fill={color} />
      <Rect x={cx + 4.3 * s} y={cy - 4 * s} width={1.7 * s} height={8 * s} rx={0.8 * s} fill={color} />
      <Rect x={cx + 7 * s} y={cy - 4 * s} width={1.7 * s} height={8 * s} rx={0.8 * s} fill={color} />
    </G>
  );
}

export function ClickWheel({
  size,
  innerRatio = layout.wheelInnerRatio,
  showLabels = true,
  center = DEFAULT_CENTER,
}: Props) {
  const c = size / 2;
  const inner = c * innerRatio;
  const labelR = (inner + c) / 2;
  const labelSize = Math.max(11, Math.round(size * 0.06));

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          {/* Wheel face: bright at the upper-left, falling off to the rim. */}
          <RadialGradient id="wheelFace" cx="38%" cy="32%" r="78%">
            <Stop offset="0" stopColor="#FFFFFF" />
            <Stop offset="0.72" stopColor="#F7F8FA" />
            <Stop offset="1" stopColor="#E4E7EC" />
          </RadialGradient>

          {/* Concave Select button: darker in the middle, lit at the rim. */}
          <RadialGradient id="selectConcave" cx="50%" cy="50%" r="62%">
            <Stop offset="0" stopColor={center.dark} />
            <Stop offset="0.62" stopColor={center.light} />
            <Stop offset="1" stopColor={center.light} />
          </RadialGradient>

          {/* Rim shadow: the recess where the wheel meets the chassis. */}
          <RadialGradient id="rimShadow" cx="50%" cy="50%" r="50%">
            <Stop offset="0.86" stopColor="#000000" stopOpacity={0} />
            <Stop offset="0.97" stopColor="#000000" stopOpacity={0.16} />
            <Stop offset="1" stopColor="#000000" stopOpacity={0.26} />
          </RadialGradient>

          {/* Top-edge sheen on the ring band. */}
          <LinearGradient id="ringSheen" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.9} />
            <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={0} />
            <Stop offset="1" stopColor="#000000" stopOpacity={0.05} />
          </LinearGradient>
        </Defs>

        {/* Outer face with its radial falloff. */}
        <Circle cx={c} cy={c} r={c} fill="url(#wheelFace)" />

        {/* Recessed rim: darkens the outer edge so the wheel sits IN the chassis. */}
        <Circle cx={c} cy={c} r={c} fill="url(#rimShadow)" />
        <Circle cx={c} cy={c} r={c - 0.75} stroke={colors.wheelRingEdge} strokeWidth={1.5} fill="none" />

        {/* Ring band sheen. */}
        <Circle cx={c} cy={c} r={c - 2} fill="url(#ringSheen)" opacity={0.5} />

        {/* Inner edge where the center button meets the ring. */}
        <Circle cx={c} cy={c} r={inner} stroke={colors.wheelRingEdge} strokeWidth={1} fill="none" />

        {/* Concave Select button. */}
        <Circle cx={c} cy={c} r={inner} fill="url(#selectConcave)" />
        <Circle cx={c} cy={c} r={inner - 0.5} stroke={colors.wheelCenterEdge} strokeWidth={1} fill="none" />

        {showLabels ? (
          <G>
            <SvgText
              x={c}
              y={c - labelR + labelSize * 0.4}
              fill={LABEL_COLOR}
              fontSize={labelSize}
              fontWeight="700"
              letterSpacing={1}
              textAnchor="middle"
            >
              MENU
            </SvgText>
            <PrevGlyph cx={c - labelR} cy={c} color={LABEL_COLOR} labelSize={labelSize} />
            <NextGlyph cx={c + labelR} cy={c} color={LABEL_COLOR} labelSize={labelSize} />
            <PlayPauseGlyph cx={c} cy={c + labelR} color={LABEL_COLOR} labelSize={labelSize} />
          </G>
        ) : null}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
