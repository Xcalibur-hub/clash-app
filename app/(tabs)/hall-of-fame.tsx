import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HOF_ENTRIES } from '../../data/hofTakes';
import { HOODS } from '../../data/hoods';
import { selectAuthor, useClash, type User } from '../../store';
import { CreatorRow } from '../../components/hof/CreatorRow';
import { HoodRow } from '../../components/hof/HoodRow';
import { MuseumCard } from '../../components/hof/MuseumCard';
import { AuroraBackground } from '../../components/shared/AuroraBackground';
import { SectionHeading } from '../../components/shared/SectionHeading';
import { SegmentedTabs, type SegmentedTab } from '../../components/shared/SegmentedTabs';
import { ink, layout, space, typeScale } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';

type HofFilter = 'clashes' | 'creators' | 'hoods';

const FILTERS: readonly SegmentedTab<HofFilter>[] = [
  { key: 'clashes', label: 'Top Clashes' },
  { key: 'creators', label: 'Creators' },
  { key: 'hoods', label: 'Hoods' },
];

/** HALL OF FAME (spec §13, reference screen 14): the permanent museum archive. */
export default function HallOfFameScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { state } = useClash();
  const [filter, setFilter] = React.useState<HofFilter>('clashes');

  const takeText = (takeId: string): string =>
    state.takes.find((item) => item.id === takeId)?.text ?? takeId;

  /** Arena's biggest reputations, viewer included and read live from the store. */
  const creators = React.useMemo(() => {
    const people: User[] = [];
    for (const id of Object.keys(state.users)) {
      const user = selectAuthor(state, id);
      if (user) people.push(user);
    }
    return people.sort((a, b) => b.reputation - a.reputation).slice(0, 10);
  }, [state]);

  const hoods = React.useMemo(() => [...HOODS].sort((a, b) => b.members - a.members), []);

  const openClash = (takeId: string): void => {
    hapticTap();
    router.push(`/clash/${takeId}`);
  };

  return (
    <AuroraBackground tone="arena" doodles={false}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.root,
          { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xxl },
        ]}
      >
        <SectionHeading eyebrow="PERMANENT ARCHIVE" title="Hall of Fame" editorial marked />
        <Text allowFontScaling={false} style={styles.subtitle}>
          Some takes don&apos;t deserve to disappear.
        </Text>

        <SegmentedTabs
          value={filter}
          items={FILTERS}
          onChange={setFilter}
          label="Hall of Fame filters"
        />

        {filter === 'clashes'
          ? HOF_ENTRIES.map((entry) => (
              <MuseumCard
                key={entry.id}
                entry={entry}
                takeText={takeText(entry.takeId)}
                onOpen={() => openClash(entry.takeId)}
              />
            ))
          : null}

        {filter === 'creators'
          ? creators.map((user, index) => (
              <CreatorRow
                key={user.id}
                position={index + 1}
                user={user}
                isViewer={user.id === state.viewer.id}
              />
            ))
          : null}

        {filter === 'hoods'
          ? hoods.map((hood, index) => (
              <HoodRow key={hood.id} position={index + 1} hood={hood} />
            ))
          : null}
      </ScrollView>
    </AuroraBackground>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: layout.screenX, gap: space.md },
  subtitle: { ...typeScale.body, color: ink.secondary },
});
