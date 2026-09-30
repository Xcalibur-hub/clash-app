import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { HOOD_LABEL } from '../../data/hoods';
import { searchAll, type SearchResults as Results } from '../../services/searchService';
import { selectAuthor, useClash } from '../../store';
import { space, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';
import { EmptyState } from '../shared/EmptyState';
import { FlameIcon, HashIcon, SearchIcon } from '../shared/icons';
import { SearchRow } from './SearchRow';

function Group({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  const t = useThemeColors();
  return (
    <View style={styles.group}>
      <Text allowFontScaling={false} style={[styles.groupLabel, { color: t.textMuted }]}>
        {label}
      </Text>
      {children}
    </View>
  );
}

export interface SearchResultsProps {
  query: string;
  onClear: () => void;
}

/** Real search results — people, Hoods, live Takes. Theme-aware. */
export function SearchResults({ query, onClear }: SearchResultsProps): React.JSX.Element {
  const { state } = useClash();
  const router = useRouter();
  const t = useThemeColors();
  const [results, setResults] = React.useState<Results | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    setResults(null);
    setFailed(false);
    searchAll(query)
      .then((rows) => {
        if (active) setResults(rows);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [query]);

  if (failed) {
    return (
      <EmptyState
        icon={SearchIcon}
        title="Search failed."
        body="We could not reach the server. Try again."
        actionLabel="CLEAR SEARCH"
        onAction={onClear}
      />
    );
  }

  if (results === null) {
    return <ActivityIndicator color={t.textMuted} style={styles.loading} />;
  }

  const { people, hoods, takes } = results;
  const total = people.length + hoods.length + takes.length;

  if (total === 0) {
    return (
      <EmptyState
        icon={SearchIcon}
        title={`No matches for “${query.trim()}”.`}
        body="Search covers people, Hoods and live Takes."
        actionLabel="CLEAR SEARCH"
        onAction={onClear}
      />
    );
  }

  const openProfile = (id: string): void => {
    hapticTap();
    router.push(`/profile/${id}`);
  };
  const openHood = (id: string): void => {
    hapticTap();
    router.push(`/(tabs)?hood=${id}`);
  };
  const openTake = (id: string): void => {
    hapticTap();
    router.push(`/take/${id}`);
  };

  return (
    <View style={styles.results}>
      {people.length > 0 ? (
        <Group label={`People · ${people.length}`}>
          {people.slice(0, 6).map((user) => (
            <SearchRow
              key={user.id}
              avatar={{ name: user.name, tint: user.tint }}
              title={`@${user.handle}`}
              meta={`${user.name} · ${user.rank}`}
              label={`Person ${user.handle}`}
              onPress={() => openProfile(user.id)}
            />
          ))}
        </Group>
      ) : null}
      {hoods.length > 0 ? (
        <Group label={`Hoods · ${hoods.length}`}>
          {hoods.slice(0, 6).map((hood) => (
            <SearchRow
              key={hood.id}
              icon={HashIcon}
              title={hood.name}
              meta={hood.tagline}
              label={`Hood ${hood.name}`}
              onPress={() => openHood(hood.id)}
            />
          ))}
        </Group>
      ) : null}
      {takes.length > 0 ? (
        <Group label={`Takes · ${takes.length}`}>
          {takes.slice(0, 6).map((take) => {
            const author = selectAuthor(state, take.authorId);
            return (
              <SearchRow
                key={take.id}
                icon={FlameIcon}
                iconColor={t.danger}
                title={take.text}
                meta={`@${author?.handle ?? 'unknown'} · ${HOOD_LABEL[take.hood]}`}
                label={`Take by ${author?.handle ?? 'unknown'}`}
                onPress={() => openTake(take.id)}
              />
            );
          })}
        </Group>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { paddingVertical: space.xxl },
  results: { gap: space.lg },
  group: { gap: space.sm },
  groupLabel: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
});
