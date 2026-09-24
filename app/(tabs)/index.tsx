import React from 'react';
import { FlatList, Share, StyleSheet, View, type ListRenderItemInfo } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArenaFeedHeader } from '../../components/arena/ArenaFeedHeader';
import { TakeCard } from '../../components/arena/TakeCard';
import { AuroraBackground } from '../../components/shared/AuroraBackground';
import { EmptyState } from '../../components/shared/EmptyState';
import { Notice } from '../../components/shared/Notice';
import { ArenaIcon } from '../../components/shared/icons';
import { HOOD_LABEL, hoodById } from '../../data/hoods';
import { useClock } from '../../hooks/useClock';
import {
  reactToTake,
  selectAuthor,
  selectClashForTake,
  selectFeed,
  selectHasReacted,
  selectIsSaved,
  showNotice,
  toggleSave,
  useClash,
  type HoodId,
  type Take,
} from '../../store';
import { layout, space } from '../../theme';
import { press as hapticPress } from '../../utils/haptics';

/** THE ARENA (spec §6) — the live 24h feed of Takes. */
export default function ArenaScreen(): React.JSX.Element {
  const { state, dispatch } = useClash();
  const router = useRouter();
  const params = useLocalSearchParams<{ hood?: string | string[] }>();
  const insets = useSafeAreaInsets();
  const initialHood: HoodId = React.useMemo(() => {
    const raw = Array.isArray(params.hood) ? params.hood[0] : params.hood;
    return raw != null && hoodById(raw as HoodId) != null ? (raw as HoodId) : 'for-you';
    // The param seeds the first paint only; afterwards the pill is the owner.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [hood, setHood] = React.useState<HoodId>(initialHood);
  const now = useClock();
  const takes = React.useMemo(() => selectFeed(state, hood, now), [hood, now, state]);

  const openClash = React.useCallback(
    (takeId: string): void => {
      hapticPress();
      router.push(`/clash/${takeId}`);
    },
    [router],
  );

  const shareTake = React.useCallback(
    async (take: Take, handle: string): Promise<void> => {
      try {
        await Share.share({ message: `CLASH — @${handle}: "${take.text}"\nMake your take.` });
      } catch {
        dispatch(showNotice('Sharing is unavailable on this device.'));
      }
    },
    [dispatch],
  );

  const renderItem = React.useCallback(
    ({ item }: ListRenderItemInfo<Take>) => {
      const author = selectAuthor(state, item.authorId);
      if (!author) return null;
      const clash = selectClashForTake(state, item.id);
      const challenger = clash ? selectAuthor(state, clash.challengerId) : undefined;
      return (
        <TakeCard
          take={item}
          author={author}
          challenger={challenger}
          isViewer={author.id === state.viewer.id}
          isSaved={selectIsSaved(state, item.id)}
          hasReacted={selectHasReacted(state, item.id)}
          clash={clash}
          now={now}
          onOpenClash={() => openClash(item.id)}
          onReact={() => dispatch(reactToTake(item.id))}
          onSave={() => dispatch(toggleSave(item.id))}
          onShare={() => {
            void shareTake(item, author.handle);
          }}
          onMore={() => dispatch(showNotice('Prototype: report & mute arrive with the backend.'))}
        />
      );
    },
    [dispatch, now, openClash, shareTake, state],
  );

  const header = React.useMemo(
    () => <ArenaFeedHeader hood={hood} liveCount={takes.length} onChangeHood={setHood} />,
    [hood, takes.length],
  );

  return (
    <AuroraBackground>
      <FlatList
        data={takes}
        keyExtractor={(take) => take.id}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ItemSeparatorComponent={Separator}
        contentContainerStyle={[
          { paddingTop: insets.top + space.md, paddingBottom: space.xxl },
        ]}
        showsVerticalScrollIndicator={false}
        initialNumToRender={3}
        maxToRenderPerBatch={4}
        windowSize={7}
        ListEmptyComponent={
          <EmptyState
            icon={ArenaIcon}
            title={`No live takes in ${HOOD_LABEL[hood]}.`}
            body="Every take self-destructs after 24 hours. Switch hoods or wait for the next drop."
            actionLabel="BACK TO FOR YOU"
            onAction={() => setHood('for-you')}
          />
        }
      />
      <Notice offset={0} />
    </AuroraBackground>
  );
}

function Separator(): React.JSX.Element {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 0 },
  separator: { height: layout.feedGap },
});
