import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Stop } from 'react-native-svg';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { accent, duration, ease, ink, space, typeScale } from '../../theme';
import type { CityName, CityShare } from '../../store/types';
import { withAlpha } from '../../utils/color';

const CITY_TINT: Record<CityName, string> = {
  Goa: '#43D6A0',
  Mumbai: '#FF6A3D',
  Bangalore: '#3D8BFF',
  Delhi: '#A580FF',
  Other: '#98A0B0',
};

const RADIUS = 74;
const CIRC = 2 * Math.PI * RADIUS;

/** Donut slice: city share of attributed orders with its own arc. */
function Slice({ share, tint, index, total }: {
  share: CityShare; tint: string; index: number; total: number;
}): React.JSX.Element {
  const frac = share.share / 100;
  const start = total;
  const dash = Math.max(frac * CIRC - 3, 2);
  const gap = CIRC - dash;
  const rotate = (start / 100) * 360 - 90;
  return (
    <G rotation={rotate} origin="90, 90">
      <Circle
        cx={90}
        cy={90}
        r={RADIUS}
        fill="none"
        stroke={tint}
        strokeWidth={index === 0 ? 17 : 14}
        strokeDasharray={`${dash} ${gap}`}
        strokeLinecap="round"
        opacity={0.92}
      />
    </G>
  );
}

/**
 * City attribution donut (§20): the exact spec dataset rendered as a light
 * SVG ring. Animated in with a stagger; reduced-motion skips the sweep.
 */
export function CityDonut({ cities, orders }: {
  cities: readonly CityShare[]; orders: number;
}): React.JSX.Element {
  const sweep = useSharedValue(0);
  React.useEffect(() => {
    sweep.value = withDelay(120, withTiming(1, { duration: duration.slow, easing: ease.out }));
  }, [sweep]);
  const spin = useAnimatedStyle(() => ({ opacity: sweep.value, transform: [{ scale: 0.94 + sweep.value * 0.06 }] }));

  let cursor = 0;
  const slices = cities.map((share, index) => {
    const start = cursor;
    cursor += share.share;
    return <Slice key={share.city} share={share} tint={CITY_TINT[share.city]} index={index} total={start} />;
  });

  return (
    <View style={styles.wrap}>
      <Animated.View style={spin}>
        <Svg width={180} height={180} viewBox="0 0 180 180">
          <Defs>
            <LinearGradient id="donut-sheen" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#fff" stopOpacity={0.25} />
              <Stop offset="1" stopColor="#fff" stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Circle cx={90} cy={90} r={RADIUS} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={14} />
          {slices}
        </Svg>
        <View style={styles.center} pointerEvents="none">
          <Text allowFontScaling={false} style={styles.orders}>{orders.toLocaleString('en-IN')}</Text>
          <Text allowFontScaling={false} style={styles.ordersLabel}>ORDERS</Text>
        </View>
      </Animated.View>
      <View style={styles.legend}>
        {cities.map((share) => (
          <View key={share.city} style={styles.row}>
            <View style={styles.labelRow}>
              <View style={[styles.dot, { backgroundColor: CITY_TINT[share.city] }]} />
              <Text allowFontScaling={false} style={styles.city}>{share.city}</Text>
            </View>
            <Text allowFontScaling={false} style={styles.share}>{share.share}%</Text>
            <View style={styles.bar}>
              <View style={[styles.fill, { width: `${share.share}%`, backgroundColor: withAlpha(CITY_TINT[share.city], 0.9) }]} />
            </View>
            <Text allowFontScaling={false} style={styles.count}>
              {`${Math.round((orders * share.share) / 100).toLocaleString('en-IN')} orders`}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  center: { position: 'absolute', top: 0, left: 0, width: 180, height: 180, alignItems: 'center', justifyContent: 'center' },
  orders: { ...typeScale.title, color: ink.primary, fontSize: 24 },
  ordersLabel: { ...typeScale.caption, color: ink.tertiary, fontSize: 10 },
  legend: { flex: 1, gap: space.sm },
  row: { gap: 3 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  dot: { width: 8, height: 8, borderRadius: 4 },
  city: { ...typeScale.label, color: ink.primary },
  share: { ...typeScale.data, color: accent.gold, position: 'absolute', right: 0 },
  bar: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  count: { ...typeScale.meta, color: ink.tertiary },
});
