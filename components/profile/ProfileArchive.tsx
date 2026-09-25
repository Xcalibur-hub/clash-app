import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { HofEntry } from '../../data/hofTakes';
import type { ClashState, Take, WinEntry } from '../../store';
import { space } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';
import { MuseumCard } from '../hof/MuseumCard';
import { EmptyState } from '../shared/EmptyState';
import { SegmentedTabs, type SegmentedTab } from '../shared/SegmentedTabs';
import { ArenaIcon, TrophyIcon } from '../shared/icons';
import { TakeGrid } from './TakeGrid';
import { WinGrid } from './WinGrid';

export type ProfileTab = 'takes' | 'wins' | 'hall-of-fame';

const TABS: readonly SegmentedTab<ProfileTab>[] = [
  { key: 'takes', label: 'Takes' },
  { key: 'wins', label: 'Wins' },
  { key: 'hall-of-fame', label: 'Hall of Fame' },
];

export interface ProfileArchiveProps {
  state: ClashState;
  takes: readonly Take[];
  wins: readonly WinEntry[];
  /** Museum records the viewer authored. */
  immortal: readonly HofEntry[];
  now: number;
}

/**
 * The viewer's archive (PRD §18–§19): segmented Takes / Wins / Hall of Fame.
 * Takes and Wins render as grids; immortal records keep the museum card.
 */
export function ProfileArchive({
  state,
  takes,
  wins,
  immortal,
  now,
}: ProfileArchiveProps): React.JSX.Element {
  const router = useRouter();
  const [tab, setTab] = React.useState<ProfileTab>('takes');

  const openClash = (takeId: string): void => { hapticTap(); router.push(`/clash/${takeId}`); };
  const takeText = (takeId: string): string => state.takes.find((item) => item.id === takeId)?.text ?? takeId;

  return (
    <View style={styles.wrap}>
      <SegmentedTabs value={tab} items={TABS} onChange={setTab} label="Profile sections" />
      {tab === 'takes' && takes.length > 0 ? <TakeGrid takes={takes} now={now} onPress={openClash} /> : null}
      {tab === 'wins' && wins.length > 0 ? <WinGrid wins={wins} onPress={openClash} /> : null}
      {tab === 'hall-of-fame' && immortal.length > 0
        ? immortal.map((entry) => (
            <MuseumCard key={entry.id} entry={entry} takeText={takeText(entry.takeId)} onOpen={() => openClash(entry.takeId)} />
          ))
        : null}
      {tab === 'takes' && takes.length === 0 ? (
        <EmptyState icon={ArenaIcon} title="No live takes."
          body="Everything you drop expires after 24 hours. Your next take lands right here."
          actionLabel="OPEN THE ARENA" onAction={() => router.push('/(tabs)')} />
      ) : null}
      {tab === 'wins' && wins.length === 0 ? (
        <EmptyState icon={TrophyIcon} title="No wins yet."
          body="Judge a clash correctly and the verdict, score and reputation land here."
          actionLabel="FIND A CLASH" onAction={() => router.push('/(tabs)')} />
      ) : null}
      {tab === 'hall-of-fame' && immortal.length === 0 ? (
        <EmptyState icon={TrophyIcon} title="Nothing immortalized yet."
          body="A take enters the Hall of Fame when its clash splits 6–3 and the jury writes it into the archive."
          actionLabel="SEE THE ARCHIVE" onAction={() => router.push('/(tabs)/explore')} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { gap: space.lg } });
