import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { fetchActivePeople } from '../../services/searchService';
import type { User } from '../../store';
import { card, ink, radius, space, typeScale } from '../../theme';
import { formatReputation } from '../../utils/format';
import { tap as hapticTap } from '../../utils/haptics';
import { Avatar } from '../shared/Avatar';
import { SectionHeading } from '../shared/SectionHeading';
import { exploreStyles as s } from './exploreStyles';

/**
 * Active people (PRD §15): real profiles ranked by reputation — an honest shelf,
 * not a fake "people you may know" list.
 */
export function PeopleSection(): React.JSX.Element | null {
  const router = useRouter();
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

  if (!people || people.length === 0) return null;

  const open = (id: string): void => {
    hapticTap();
    router.push(`/profile/${id}`);
  };

  return (
    <View style={s.section}>
      <SectionHeading eyebrow="PEOPLE" title="Active people" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.shelf}>
        {people.map((user) => (
          <Pressable
            key={user.id}
            onPress={() => open(user.id)}
            accessibilityRole="button"
            accessibilityLabel={`Open @${user.handle}`}
            style={styles.card}
          >
            <Avatar name={user.name} tint={user.tint} size={48} />
            <Text allowFontScaling={false} numberOfLines={1} style={styles.handle}>
              @{user.handle}
            </Text>
            <Text allowFontScaling={false} numberOfLines={1} style={styles.meta}>
              {formatReputation(user.reputation)} XP
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 132,
    alignItems: 'center',
    gap: space.xs,
    padding: space.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: card.border,
    backgroundColor: card.native,
  },
  handle: { ...typeScale.label, color: ink.primary, fontWeight: '700', maxWidth: '100%' },
  meta: { ...typeScale.meta, color: ink.tertiary },
});
