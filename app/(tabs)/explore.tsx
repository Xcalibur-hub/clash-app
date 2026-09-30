import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HoodsSection } from '../../components/explore/HoodsSection';
import { PeopleSection } from '../../components/explore/PeopleSection';
import { PopularTakesSection } from '../../components/explore/PopularTakesSection';
import { SearchResults } from '../../components/explore/SearchResults';
import { WorldSection } from '../../components/explore/WorldSection';
import { ExploreSearch } from '../../components/explore/ExploreSearch';
import { Underline } from '../../components/shared/Doodles';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useClash } from '../../store';
import { useAuth } from '../../store/AuthProvider';
import { dockBottomPadding } from '../../components/navigation/dockConfig';
import { layout, space, typeScale, useThemeColors } from '../../theme';

/**
 * EXPLORE — premium discovery surface.
 * Real search + shelves: Trending, Play/World, Hoods, People.
 */
export default function ExploreScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const theme = useThemeColors();
  const { signedIn } = useAuth();
  const { state } = useClash();
  const [query, setQuery] = React.useState('');
  const debounced = useDebouncedValue(query, 250);
  const searching = debounced.trim().length > 0;
  const profileId = signedIn ? state.viewer.id : null;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + space.sm,
            paddingBottom: dockBottomPadding(insets.bottom),
          },
        ]}
      >
        <View style={styles.hero}>
          <Text allowFontScaling={false} style={[styles.title, { color: theme.textPrimary }]}>
            Explore
          </Text>
          <View style={styles.subWrap}>
            <Text allowFontScaling={false} style={[styles.subtitle, { color: theme.textSecondary }]}>
              Find your next rabbit hole.
            </Text>
            <Underline size={72} color={theme.textPrimary} opacity={0.18} style={styles.mark} />
          </View>
        </View>

        <ExploreSearch value={query} onChange={setQuery} />

        {searching ? (
          <SearchResults query={debounced} onClear={() => setQuery('')} />
        ) : (
          <View style={styles.shelves}>
            <PopularTakesSection />
            <WorldSection />
            <HoodsSection profileId={profileId} signedIn={signedIn} />
            <PeopleSection />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    paddingHorizontal: layout.screenX,
    gap: space.lg,
  },
  hero: { gap: 4, paddingBottom: 2 },
  title: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  subWrap: { paddingBottom: 4 },
  subtitle: {
    ...typeScale.body,
    fontSize: 15,
    lineHeight: 21,
  },
  mark: { marginTop: 2 },
  shelves: { gap: space.xl },
});
