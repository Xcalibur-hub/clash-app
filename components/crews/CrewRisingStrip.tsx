import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ArenaCrew } from '../../services/arenaCrewService';
import { layout, space, typeScale, useThemeColors } from '../../theme';
import { formatCrewMembers } from '../../utils/arenaCrewIdentity';
import { tap as hapticTap } from '../../utils/haptics';
import { CrewCrest } from './CrewCrest';

export interface CrewRisingStripProps {
  crews: ArenaCrew[];
  onOpen: (crew: ArenaCrew) => void;
}

/** Horizontal rising-Crew strip — visual rhythm between featured and rows. */
export function CrewRisingStrip({ crews, onOpen }: CrewRisingStripProps): React.JSX.Element | null {
  const t = useThemeColors();
  if (crews.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text allowFontScaling={false} style={[styles.title, { color: t.textSecondary }]}>
        RISING THIS WEEK
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {crews.map((crew) => (
          <Pressable
            key={crew.id}
            onPress={() => {
              hapticTap();
              onOpen(crew);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Rising Crew ${crew.name}`}
            style={styles.item}
          >
            <CrewCrest
              id={crew.id}
              name={crew.name}
              slug={crew.slug}
              specialties={crew.specialties}
              avatarUrl={crew.avatarUrl}
              size={52}
            />
            <Text
              allowFontScaling={false}
              style={[styles.name, { color: t.textPrimary }]}
              numberOfLines={1}
            >
              {crew.name}
            </Text>
            <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]} numberOfLines={1}>
              {formatCrewMembers(crew.memberCount)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: space.sm, paddingBottom: space.md, gap: space.sm },
  title: {
    ...typeScale.meta,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    paddingHorizontal: layout.screenX,
  },
  row: {
    paddingHorizontal: layout.screenX,
    gap: space.md,
  },
  item: {
    width: 88,
    alignItems: 'center',
    gap: 6,
  },
  name: { ...typeScale.label, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  meta: { ...typeScale.meta, fontSize: 11, textAlign: 'center' },
});
