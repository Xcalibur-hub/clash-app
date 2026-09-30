import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { fetchActivePeople } from '../../services/searchService';
import type { User } from '../../store';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { formatReputation } from '../../utils/format';
import { tap as hapticTap } from '../../utils/haptics';
import { Avatar } from '../shared/Avatar';
import { PressableScale } from '../shared/PressableScale';
import { ExploreHeading } from './ExploreHeading';

/** Active people shelf — real profiles by reputation. */
export function PeopleSection(): React.JSX.Element | null {
  const router = useRouter();
  const t = useThemeColors();
  const [people, setPeople] = React.useState<User[] | null>(null);

  React.useEffect(() => {
    let active = true;
    fetchActivePeople(8)
      .then((rows) => {
        if (active) setPeople(rows);
      })
      .catch(() => {
        if (active) setPeople([]);
      });
    return () => {
      active = false;
    };
  }, []);

  if (people === null) {
    return (
      <View style={styles.section}>
        <ExploreHeading title="Active people" />
        <ActivityIndicator color={t.textMuted} style={styles.spinner} />
      </View>
    );
  }

  if (people.length === 0) return null;

  const open = (id: string): void => {
    hapticTap();
    router.push(`/profile/${id}`);
  };

  return (
    <View style={styles.section}>
      <ExploreHeading title="Active people" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
        {people.map((user) => (
          <PressableScale
            key={user.id}
            onPress={() => open(user.id)}
            accessibilityRole="button"
            accessibilityLabel={`Open @${user.handle}`}
            style={[
              styles.card,
              {
                backgroundColor: t.surface,
                borderColor: t.border,
                shadowColor: t.shadowColor,
                shadowOpacity: t.scheme === 'light' ? 0.07 : 0,
              },
            ]}
          >
            <Avatar name={user.name} tint={user.tint} size={48} />
            <Text allowFontScaling={false} numberOfLines={1} style={[styles.handle, { color: t.textPrimary }]}>
              @{user.handle}
            </Text>
            <Text allowFontScaling={false} numberOfLines={1} style={[styles.meta, { color: t.textMuted }]}>
              {formatReputation(user.reputation)} XP
            </Text>
          </PressableScale>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.md },
  rail: { gap: 10, paddingRight: 4 },
  card: {
    width: 128,
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  handle: { ...typeScale.label, fontSize: 13, fontWeight: '700', maxWidth: '100%' },
  meta: { ...typeScale.meta, fontSize: 11 },
  spinner: { paddingVertical: space.lg },
});
