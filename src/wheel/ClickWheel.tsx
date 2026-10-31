/**
 * Static SVG click wheel. Purely visual: no touch handling here.
 * The gesture is attached by the parent via GestureDetector wrapping this view,
 * so the wheel's own SVG children never intercept touches.
 *
 * Note: GestureDetector's child must be a native view. A plain <View> wrapper
 * is used rather than <Svg>, because Svg children can swallow pointer events
 * on some Android versions.
 */

import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';

import { colors, layout } from '../ui/theme';

type Props = {
  /** Outer diameter in points. */
  size: number;
  /** Center button diameter as a ratio of size. */
  innerRatio?: number;
  /** Draws the four labels. */
  showLabels?: boolean;
};

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

export function ClickWheel({ size, innerRatio = layout.wheelInnerRatio, showLabels = true }: Props) {
  const c = size / 2;
  const inner = c * innerRatio;
  const labelR = (inner + c) / 2;
  const labelSize = Math.max(11, Math.round(size * 0.06));
  const labelColor = colors.wheelLabel;

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Outer face */}
        <Circle cx={c} cy={c} r={c} fill={colors.wheelFace} />
        <Circle cx={c} cy={c} r={c - 0.75} stroke={colors.wheelRingEdge} strokeWidth={1.5} fill="none" />

        {/* Ring / inner edge where the center button meets the ring */}
        <Circle cx={c} cy={c} r={inner} stroke={colors.wheelRingEdge} strokeWidth={1} fill="none" />

        {/* Center select button */}
        <Circle cx={c} cy={c} r={inner} fill={colors.wheelCenter} />
        <Circle cx={c} cy={c} r={inner - 0.5} stroke={colors.wheelCenterEdge} strokeWidth={1} fill="none" />

        {showLabels ? (
          <G>
            <SvgText
              x={c}
              y={c - labelR + labelSize * 0.4}
              fill={labelColor}
              fontSize={labelSize}
              fontWeight="700"
              letterSpacing={1}
              textAnchor="middle"
            >
              MENU
            </SvgText>
            <PrevGlyph cx={c - labelR} cy={c} color={labelColor} labelSize={labelSize} />
            <NextGlyph cx={c + labelR} cy={c} color={labelColor} labelSize={labelSize} />
            <PlayPauseGlyph cx={c} cy={c + labelR} color={labelColor} labelSize={labelSize} />
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
