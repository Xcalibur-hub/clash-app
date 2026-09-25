import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { HOF_ENTRIES } from '../../data/hofTakes';
import { useClash } from '../../store';
import { tap as hapticTap } from '../../utils/haptics';
import { MuseumCard } from '../hof/MuseumCard';
import { SectionHeading } from '../shared/SectionHeading';
import { exploreStyles as s } from './exploreStyles';

/**
 * Hall of Fame (PRD §17): legendary takes shown up large — the permanent
 * nature stays clear without turning the shelf into a stats database.
 */
export function FameSection(): React.JSX.Element {
  const router = useRouter();
  const { state } = useClash();

  const takeText = (takeId: string): string =>
    state.takes.find((item) => item.id === takeId)?.text ?? takeId;

  const openClash = (takeId: string): void => {
    hapticTap();
    router.push(`/clash/${takeId}`);
  };

  return (
    <View style={s.section}>
      <SectionHeading eyebrow="PERMANENT ARCHIVE" title="Hall of Fame" editorial marked />
      <Text allowFontScaling={false} style={s.subtitle}>
        Some takes don&apos;t deserve to disappear.
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.shelf}>
        {HOF_ENTRIES.slice(0, 6).map((entry) => (
          <View key={entry.id} style={s.shelfCard}>
            <MuseumCard
              entry={entry}
              takeText={takeText(entry.takeId)}
              onOpen={() => openClash(entry.takeId)}
            />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
