import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProfileArchive } from '../../components/profile/ProfileArchive';
import { ProfileIdentity } from '../../components/profile/ProfileIdentity';
import { Notice } from '../../components/shared/Notice';
import { HOF_ENTRIES } from '../../data/hofTakes';
import { useClock } from '../../hooks/useClock';
import { selectViewerTakes, selectViewerWins, showNotice, useClash } from '../../store';
import { color, layout, space } from '../../theme';

/**
 * PROFILE (PRD §18–§19) — a social identity first: avatar, bio, three numbers,
 * Edit Profile, then the segmented archive with Instagram-style grids. Flat
 * #08080B canvas; no aurora, no dashboard box.
 */
export default function ProfileScreen(): React.JSX.Element {
  const { state, dispatch } = useClash();
  const insets = useSafeAreaInsets();
  const now = useClock();
  const viewer = state.viewer;

  const allTakes = React.useMemo(() => selectViewerTakes(state), [state]);
  const takes = React.useMemo(() => allTakes.filter((take) => take.expiresAt > now), [allTakes, now]);
  const wins = React.useMemo(() => selectViewerWins(state), [state]);
  const immortal = React.useMemo(
    () => HOF_ENTRIES.filter((entry) => state.takes.some((take) => take.id === entry.takeId && take.authorId === viewer.id)),
    [state.takes, viewer.id],
  );

  const editProfile = (): void => {
    dispatch(showNotice('Editing your profile arrives with the backend.'));
  };

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xxl },
        ]}
      >
        <ProfileIdentity viewer={viewer} takesCount={allTakes.length} onEdit={editProfile} />
        <ProfileArchive state={state} takes={takes} wins={wins} immortal={immortal} now={now} />
      </ScrollView>
      <Notice offset={0} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.bg },
  content: { paddingHorizontal: layout.screenX, gap: space.xl },
});
