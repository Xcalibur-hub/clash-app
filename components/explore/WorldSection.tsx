import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { card, ink, radius, space, typeScale } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';
import { SectionHeading } from '../shared/SectionHeading';
import { WorldIcon } from '../shared/icons';
import { exploreStyles as s } from './exploreStyles';

/** Explore entry into World — Missions + nearby Drops. Not a live map. */
export function WorldSection(): React.JSX.Element {
  const router = useRouter();
  return (
    <View style={s.section}>
      <SectionHeading eyebrow="WORLD" title="Weekly missions near you" />
      <Pressable
        onPress={() => {
          hapticTap();
          router.push('/world');
        }}
        style={styles.card}
        accessibilityRole="button"
        accessibilityLabel="Open World"
      >
        <WorldIcon size={22} color={ink.primary} strokeWidth={2.2} />
        <View style={styles.copy}>
          <Text allowFontScaling={false} style={styles.title}>This week’s missions</Text>
          <Text allowFontScaling={false} style={styles.body}>
            Post a photo around an approximate area. No live tracking.
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: card.border,
    backgroundColor: card.solid,
  },
  copy: { flex: 1, gap: 4 },
  title: { ...typeScale.label, color: ink.primary, fontWeight: '700' },
  body: { ...typeScale.meta, color: ink.tertiary },
});
