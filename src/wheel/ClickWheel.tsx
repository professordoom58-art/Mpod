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
import Svg, { Circle, G, Text as SvgText } from 'react-native-svg';

import { colors, layout } from '../ui/theme';

type Props = {
  /** Outer diameter in points. */
  size: number;
  /** Center button diameter as a ratio of size. */
  innerRatio?: number;
  /** Draws the four labels. */
  showLabels?: boolean;
};

export function ClickWheel({ size, innerRatio = layout.wheelInnerRatio, showLabels = true }: Props) {
  const c = size / 2;
  const inner = c * innerRatio;
  const labelR = (inner + c) / 2;
  const labelSize = Math.max(9, Math.round(size * 0.045));

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Outer face */}
        <Circle cx={c} cy={c} r={c} fill={colors.wheelFace} />
        <Circle cx={c} cy={c} r={c - 0.5} stroke={colors.wheelRingEdge} strokeWidth={1} fill="none" />

        {/* Ring band (visual only, the whole annulus is the touch target) */}
        <Circle cx={c} cy={c} r={c - 1} stroke={colors.wheelRing} strokeWidth={1} fill="none" />
        <Circle cx={c} cy={c} r={inner} stroke={colors.wheelRingEdge} strokeWidth={1} fill="none" />

        {/* Center select button */}
        <Circle cx={c} cy={c} r={inner} fill={colors.wheelCenter} />
        <Circle cx={c} cy={c} r={inner - 0.5} stroke={colors.wheelCenterEdge} strokeWidth={1} fill="none" />

        {showLabels ? (
          <G>
            <SvgText
              x={c}
              y={c - labelR + labelSize * 0.35}
              fill={colors.wheelLabel}
              fontSize={labelSize}
              fontWeight="600"
              textAnchor="middle"
            >
              MENU
            </SvgText>
            <SvgText
              x={c - labelR}
              y={c + labelSize * 0.35}
              fill={colors.wheelLabel}
              fontSize={labelSize}
              fontWeight="600"
              textAnchor="middle"
            >
              {'\u25C0'}
            </SvgText>
            <SvgText
              x={c + labelR}
              y={c + labelSize * 0.35}
              fill={colors.wheelLabel}
              fontSize={labelSize}
              fontWeight="600"
              textAnchor="middle"
            >
              {'\u25B6'}
            </SvgText>
            <SvgText
              x={c}
              y={c + labelR + labelSize * 0.35}
              fill={colors.wheelLabel}
              fontSize={labelSize}
              fontWeight="600"
              textAnchor="middle"
            >
              {'\u25B6\u2016'}
            </SvgText>
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
