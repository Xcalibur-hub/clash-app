import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { HOF_ENTRIES, type HofEntry } from '../../data/hofTakes';
import { HOODS, HOOD_LABEL } from '../../data/hoods';
import { selectAuthor, showNotice, useClash, type ClashState, type Hood, type Take, type User } from '../../store';
import { accent, ink, space, typeScale } from '../../theme';
import { press as hapticPress, tap as hapticTap } from '../../utils/haptics';
import { HoodRow } from '../hof/HoodRow';
import { EmptyState } from '../shared/EmptyState';
import { FlameIcon, SearchIcon, TrophyIcon } from '../shared/icons';
import { SearchRow } from './SearchRow';

interface QueryResults {
  people: readonly User[];
  hoods: readonly Hood[];
  takes: readonly Take[];
  fame: readonly HofEntry[];
}

function takeTextOf(state: ClashState, takeId: string): string {
  return state.takes.find((item) => item.id === takeId)?.text ?? takeId;
}

function takeMeta(state: ClashState, take: Take): string {
  const handle = selectAuthor(state, take.authorId)?.handle;
  return `${handle ? `@${handle} · ` : ''}${HOOD_LABEL[take.hood]}`;
}

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

/** Mock search (PRD §15): live-filters people, hoods, takes and Hall of Fame
 * entries on-device — backend search arrives later. */
export function SearchResults({ query, onClear }: SearchResultsProps): React.JSX.Element {
  const { state, dispatch } = useClash();
  const router = useRouter();
  const needle = query.trim().toLowerCase();

  const results = React.useMemo<QueryResults>(() => {
    const match = (text: string): boolean => text.toLowerCase().includes(needle);
    const people = [state.viewer, ...Object.values(state.users)]
      .filter((user, index, all) => all.findIndex((item) => item.id === user.id) === index)
      .filter((user) => match(user.handle) || match(user.name));
    const hoods = HOODS.filter((hood) => match(hood.name) || match(hood.tagline));
    const takes = state.takes.filter((take) => match(take.text));
    const fame = HOF_ENTRIES.filter((entry) => match(takeTextOf(state, entry.takeId)));
    return { people, hoods, takes, fame };
  }, [needle, state]);

  const openHood = (hoodId: string): void => { hapticTap(); router.push(`/(tabs)?hood=${hoodId}`); };
  const openTake = (takeId: string): void => { hapticTap(); router.push(`/take/${takeId}`); };
  const openClash = (takeId: string): void => { hapticTap(); router.push(`/clash/${takeId}`); };
  const openProfile = (): void => { hapticPress(); dispatch(showNotice('Profile pages arrive with the backend.')); };
  const { people, hoods, takes, fame } = results;
  const total = people.length + hoods.length + takes.length + fame.length;

  if (total === 0) {
    return (
      <EmptyState
        icon={SearchIcon}
        title={`No matches for “${query.trim()}”.`}
        body="Search covers people, hoods, takes and the Hall of Fame — all on-device for now."
        actionLabel="CLEAR SEARCH"
        onAction={onClear}
      />
    );
  }

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
              onPress={openProfile}
            />
          ))}
        </Group>
      ) : null}
      {hoods.length > 0 ? (
        <Group label={`HOODS · ${hoods.length}`}>
          {hoods.map((hood, index) => (
            <HoodRow
              key={hood.id}
              position={index + 1}
              hood={hood}
              label={`Open ${hood.name}`}
              onPress={() => openHood(hood.id)}
            />
          ))}
        </Group>
      ) : null}
      {takes.length > 0 ? (
        <Group label={`TAKES · ${takes.length}`}>
          {takes.slice(0, 6).map((take) => (
            <SearchRow
              key={take.id}
              icon={FlameIcon}
              title={take.text}
              meta={takeMeta(state, take)}
              label={`Take: ${take.text}`}
              onPress={() => openTake(take.id)}
            />
          ))}
        </Group>
      ) : null}
      {fame.length > 0 ? (
        <Group label={`HALL OF FAME · ${fame.length}`}>
          {fame.slice(0, 4).map((entry) => (
            <SearchRow
              key={entry.id}
              icon={TrophyIcon}
              iconColor={accent.gold}
              title={`“${takeTextOf(state, entry.takeId)}”`}
              meta={`${entry.scoreA}–${entry.scoreB} · ${entry.date}`}
              label={`Hall of Fame take: ${takeTextOf(state, entry.takeId)}`}
              onPress={() => openClash(entry.takeId)}
            />
          ))}
        </Group>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  results: { gap: space.lg },
  group: { gap: space.sm },
  groupLabel: { ...typeScale.eyebrow, color: ink.tertiary },
});
