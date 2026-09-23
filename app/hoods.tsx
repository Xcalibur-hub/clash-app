import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HOODS } from '../data/hoods';
import { HoodRow } from '../components/hof/HoodRow';
import { SearchBar } from '../components/hof/SearchBar';
import { AuroraBackground } from '../components/shared/AuroraBackground';
import { IconButton } from '../components/shared/IconButton';
import { SectionHeading } from '../components/shared/SectionHeading';
import { BackIcon, PinIcon, SearchIcon } from '../components/shared/icons';
import { EmptyState } from '../components/shared/EmptyState';
import { ink, layout, space, typeScale } from '../theme';
import { tap as hapticTap } from '../utils/haptics';

/**
 * HOODS DIRECTORY (reference screen 12): every hood in one shelf, ranked by
 * live clashes. A row opens its hood's feed in the Arena.
 */
export default function HoodsScreen(): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const back = (): void => {
    hapticTap();
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(tabs)');
  };
  const openHood = (hoodId: string): void => {
    hapticTap();
    router.push(`/(tabs)?hood=${hoodId}`);
  };

  const hoods = React.useMemo(() => [...HOODS].sort((a, b) => b.liveClashes - a.liveClashes), []);
  const [query, setQuery] = React.useState('');
  const matches = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length === 0) return hoods;
    return hoods.filter(
      (hood) =>
        hood.name.toLowerCase().includes(needle) ||
        hood.tagline.toLowerCase().includes(needle),
    );
  }, [hoods, query]);

  return (
    <AuroraBackground tone="arena" doodles={false}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.root,
          { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xxl },
        ]}
      >
        <View style={styles.topRow}>
          <IconButton icon={BackIcon} onPress={back} label="Back" />
          <Text allowFontScaling={false} style={styles.title}>
            Hoods
          </Text>
          <IconButton
            icon={PinIcon}
            onPress={() => openHood(hoods[0]?.id ?? 'techtakes')}
            label="Open the top trending hood"
          />
        </View>

        <SectionHeading eyebrow="TRENDING IN GOA" title="Where the city argues" editorial marked />

        <SearchBar value={query} onChange={setQuery} />

        <View style={styles.list}>
          {matches.length === 0 ? (
            <EmptyState
              icon={SearchIcon}
              title="No hoods match that search."
              body="Try a hood name or a vibe — phones, degrees, football."
              actionLabel="CLEAR SEARCH"
              onAction={() => setQuery('')}
            />
          ) : (
            matches.map((hood, index) => (
              <HoodRow
                key={hood.id}
                position={index + 1}
                hood={hood}
                tag="TRENDING"
                onPress={() => openHood(hood.id)}
              />
            ))
          )}
        </View>
      </ScrollView>
    </AuroraBackground>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: layout.screenX, gap: space.md },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...typeScale.title, letterSpacing: 1.5, color: ink.primary },
  list: { gap: 0, marginTop: space.sm },
});