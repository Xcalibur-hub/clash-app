import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { HOOD_LABEL } from '../../data/hoods';
import { searchAll, type SearchResults as Results } from '../../services/searchService';
import { selectAuthor, useClash } from '../../store';
import { accent, ink, space, typeScale } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';
import { EmptyState } from '../shared/EmptyState';
import { FlameIcon, HashIcon, SearchIcon } from '../shared/icons';
import { SearchRow } from './SearchRow';

function Group({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <View style={styles.group}>
      <Text allowFontScaling={false} style={styles.groupLabel}>
        {label}
      </Text>
      {children}
    </View>
  );
}

export interface SearchResultsProps {
  query: string;
  /** Clears the search field from the empty state. */
  onClear: () => void;
}

/**
 * Real search (PRD §15): bounded, typed queries against the live Arena — people
 * and takes over Postgres, Hoods over the fixed catalogue. No on-device mock.
 */
export function SearchResults({ query, onClear }: SearchResultsProps): React.JSX.Element {
  const { state } = useClash();
  const router = useRouter();
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
    return <ActivityIndicator color="#FFFFFF" style={styles.loading} />;
  }

  const { people, hoods, takes } = results;
  const total = people.length + hoods.length + takes.length;

  if (total === 0) {
    return (
      <EmptyState
        icon={SearchIcon}
        title={`No matches for "${query.trim()}".`}
        body="Search covers people, hoods and live takes."
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
        <Group label={`PEOPLE · ${people.length}`}>
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
        <Group label={`HOODS · ${hoods.length}`}>
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
        <Group label={`TAKES · ${takes.length}`}>
          {takes.slice(0, 6).map((take) => {
            const author = selectAuthor(state, take.authorId);
            return (
              <SearchRow
                key={take.id}
                icon={FlameIcon}
                iconColor={accent.danger}
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
  groupLabel: { ...typeScale.eyebrow, color: ink.tertiary },
});
