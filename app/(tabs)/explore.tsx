import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HoodsSection } from '../../components/explore/HoodsSection';
import { PeopleSection } from '../../components/explore/PeopleSection';
import { PopularTakesSection } from '../../components/explore/PopularTakesSection';
import { SearchResults } from '../../components/explore/SearchResults';
import { WorldSection } from '../../components/explore/WorldSection';
import { exploreStyles as shelf } from '../../components/explore/exploreStyles';
import { SearchBar } from '../../components/hof/SearchBar';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useClash } from '../../store';
import { useAuth } from '../../store/AuthProvider';
import { color, space } from '../../theme';

/**
 * EXPLORE (PRD §15) — one debounced search field over the live Arena, then three
 * honest discovery shelves: Popular takes, Hoods (real membership) and Active
 * people. Flat #08080B canvas: content carries the colour.
 */
export default function ExploreScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { signedIn } = useAuth();
  const { state } = useClash();
  const [query, setQuery] = React.useState('');
  const debounced = useDebouncedValue(query, 250);
  const searching = debounced.trim().length > 0;
  const profileId = signedIn ? state.viewer.id : null;

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          shelf.root,
          { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xxl },
        ]}
      >
        <SearchBar value={query} onChange={setQuery} placeholder="Search CLASH" />
        {searching ? (
          <SearchResults query={debounced} onClear={() => setQuery('')} />
        ) : (
          <View style={styles.shelves}>
            <WorldSection />
            <PopularTakesSection />
            <HoodsSection profileId={profileId} signedIn={signedIn} />
            <PeopleSection />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.bg },
  shelves: { gap: space.xl },
});

