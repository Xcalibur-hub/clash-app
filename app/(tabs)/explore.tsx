import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DailyDropSection } from '../../components/explore/DailyDropSection';
import { FameSection } from '../../components/explore/FameSection';
import { HoodsSection } from '../../components/explore/HoodsSection';
import { SearchResults } from '../../components/explore/SearchResults';
import { TrendingSection } from '../../components/explore/TrendingSection';
import { exploreStyles as shelf } from '../../components/explore/exploreStyles';
import { SearchBar } from '../../components/hof/SearchBar';
import { color, space } from '../../theme';

/**
 * EXPLORE (PRD §15) — one search field over the existing mock data, then the
 * four discovery shelves: Trending, Popular in your Hoods, Daily Drop (§16)
 * and Hall of Fame (§17). Flat #08080B canvas: content carries the colour.
 */
export default function ExploreScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = React.useState('');
  const searching = query.trim().length > 0;

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
          <SearchResults query={query} onClear={() => setQuery('')} />
        ) : (
          <View style={styles.shelves}>
            <TrendingSection />
            <HoodsSection />
            <DailyDropSection />
            <FameSection />
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
