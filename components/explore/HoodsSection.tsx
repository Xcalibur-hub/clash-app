import React from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { HOODS } from '../../data/hoods';
import { tap as hapticTap } from '../../utils/haptics';
import { HoodRow } from '../hof/HoodRow';
import { SectionHeading } from '../shared/SectionHeading';
import { exploreStyles as s } from './exploreStyles';

/**
 * Popular in your Hoods (PRD §15): every hood ranked by live clashes, one
 * tap away from filtering the Arena feed.
 */
export function HoodsSection(): React.JSX.Element {
  const router = useRouter();
  const hoods = React.useMemo(
    () => [...HOODS].sort((a, b) => b.liveClashes - a.liveClashes).slice(0, 8),
    [],
  );

  const openHood = (hoodId: string): void => {
    hapticTap();
    router.push(`/(tabs)?hood=${hoodId}`);
  };

  return (
    <View style={s.section}>
      <SectionHeading eyebrow="DISCOVER" title="Popular in your Hoods" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.shelf}>
        {hoods.map((hood, index) => (
          <View key={hood.id} style={s.hoodCard}>
            <HoodRow
              position={index + 1}
              hood={hood}
              tag="TRENDING"
              label={`Open ${hood.name}`}
              onPress={() => openHood(hood.id)}
            />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
