import React from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { duel, ink, radius, space, typeScale } from '../../theme';

/** The pivot of the Clash screen: a centred VS pill between two hairline gradients. */
export function VersusHeader(): React.JSX.Element {
  return (
    <Animated.View entering={FadeIn.duration(260)} style={styles.wrap}>
      <LinearGradient
        colors={['rgba(165,128,255,0)', duel.a]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.line}
      />
      <View style={styles.pill}>
        <Text allowFontScaling={false} style={styles.label}>
          VS
        </Text>
      </View>
      <LinearGradient
        colors={[duel.b, 'rgba(61,139,255,0)']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.line}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  line: { flex: 1, height: 1 },
  pill: {
    minWidth: 54,
    height: 30,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  label: { ...typeScale.caption, color: ink.primary, letterSpacing: 1.4 },
});
