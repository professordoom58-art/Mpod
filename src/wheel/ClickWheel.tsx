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
 *
 * Theme support (Feature 3): the face, its edge, the concave Select button and
 * the label ink all derive from `wheelColor` / `wheelTextColor`, so a theme
 * change repaints the wheel reactively. The face gradient stops and edges are
 * computed with the shared color helpers instead of being hard-coded white.
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

import { darkenHex, hexLuminance, layout, lightenHex } from '../ui/theme';

type Props = {
  /** Outer diameter in points. */
  size: number;
  /** Center button diameter as a ratio of size. */
  innerRatio?: number;
  /** Draws the four labels. */
  showLabels?: boolean;
  /** Wheel face color from the active AppThemeConfig. */
  wheelColor?: string;
  /** Wheel label/glyph ink from the active AppThemeConfig. */
  wheelTextColor?: string;
  /**
   * Optional Select-button face color. When it differs from `wheelColor` the
   * center disc is painted in this color (its shading still reads concave)
   * while the outer ring stays the crisp `wheelColor`.
   */
  centerButtonColor?: string;
  /**
   * Explicit concavity override: `light` is the lit rim, `dark` the recessed
   * middle. Only used when `centerButtonColor` is absent.
   */
  center?: { light: string; dark: string };
};

/** iPod Classic silver face, used until a theme is resolved. */
const DEFAULT_WHEEL_COLOR = '#FFFFFF';
/** Crisp label ink, per the iPod Classic wheel. */
const DEFAULT_WHEEL_INK = '#858D99';

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
  wheelColor = DEFAULT_WHEEL_COLOR,
  wheelTextColor = DEFAULT_WHEEL_INK,
  centerButtonColor,
  center,
}: Props) {
  const c = size / 2;
  const inner = c * innerRatio;
  const labelR = (inner + c) / 2;
  const labelSize = Math.max(11, Math.round(size * 0.06));

  // Theme-derived finish. For the default white face these resolve to the
  // original silver values; for a dark or colored wheel they stay in family.
  const faceTop = wheelColor;
  const faceMid = darkenHex(wheelColor, 0.03);
  const faceBottom = darkenHex(wheelColor, 0.11);
  const faceEdge = darkenHex(wheelColor, 0.14);

  // Colored Select button (FigPod anodized set): the disc takes the preset's
  // center/shell color while the outer ring stays satin white. The shading is
  // still concave — lit at the rim, slightly darker in the middle.
  const customCenter =
    centerButtonColor !== undefined &&
    centerButtonColor.toLowerCase() !== wheelColor.toLowerCase();
  const centerBase = centerButtonColor ?? wheelColor;
  const centerLight =
    center?.light ??
    (customCenter ? lightenHex(centerBase, 0.04) : darkenHex(wheelColor, 0.06));
  const centerDark =
    center?.dark ?? (customCenter ? darkenHex(centerBase, 0.12) : darkenHex(wheelColor, 0.14));
  const centerEdge = customCenter ? darkenHex(centerBase, 0.24) : darkenHex(wheelColor, 0.2);

  // A white sheen at full strength washes out a black or red wheel, so the
  // ring gloss scales with the face brightness (0.15 .. 0.5).
  const sheenOpacity = 0.15 + 0.35 * hexLuminance(wheelColor);

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          {/* Wheel face: bright at the upper-left, falling off to the rim. */}
          <RadialGradient id="wheelFace" cx="38%" cy="32%" r="78%">
            <Stop offset="0" stopColor={faceTop} />
            <Stop offset="0.72" stopColor={faceMid} />
            <Stop offset="1" stopColor={faceBottom} />
          </RadialGradient>

          {/* Concave Select button: darker in the middle, lit at the rim. */}
          <RadialGradient id="selectConcave" cx="50%" cy="50%" r="62%">
            <Stop offset="0" stopColor={centerDark} />
            <Stop offset="0.62" stopColor={centerLight} />
            <Stop offset="1" stopColor={centerLight} />
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
        <Circle cx={c} cy={c} r={c - 0.75} stroke={faceEdge} strokeWidth={1.5} fill="none" />

        {/* Ring band sheen. */}
        <Circle cx={c} cy={c} r={c - 2} fill="url(#ringSheen)" opacity={sheenOpacity} />

        {/* Inner edge where the center button meets the ring. */}
        <Circle cx={c} cy={c} r={inner} stroke={faceEdge} strokeWidth={1} fill="none" />

        {/* Concave Select button. */}
        <Circle cx={c} cy={c} r={inner} fill="url(#selectConcave)" />
        <Circle cx={c} cy={c} r={inner - 0.5} stroke={centerEdge} strokeWidth={1} fill="none" />

        {showLabels ? (
          <G>
            <SvgText
              x={c}
              y={c - labelR + labelSize * 0.4}
              fill={wheelTextColor}
              fontSize={labelSize}
              fontWeight="700"
              letterSpacing={1}
              textAnchor="middle"
            >
              MENU
            </SvgText>
            <PrevGlyph cx={c - labelR} cy={c} color={wheelTextColor} labelSize={labelSize} />
            <NextGlyph cx={c + labelR} cy={c} color={wheelTextColor} labelSize={labelSize} />
            <PlayPauseGlyph cx={c} cy={c + labelR} color={wheelTextColor} labelSize={labelSize} />
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
