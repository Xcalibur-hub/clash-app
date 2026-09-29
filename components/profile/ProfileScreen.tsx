import React from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Take, User } from '../../store';
import { showNotice, useClash } from '../../store';
import { useAuth } from '../../store/AuthProvider';
import { errorText } from '../../services/supabaseClient';
import { fetchProfilesByIds } from '../../services/apiService';
import { fetchFollowState, followUser, unfollowUser, type FollowState } from '../../services/socialService';
import { fetchViewerSafetyState } from '../../services/safetyService';
import { fetchVault } from '../../services/vaultService';
import {
  fetchProfileById,
  fetchProfileClashes,
  fetchProfileReplies,
  fetchProfileTakes,
  type ProfileClash,
  type ProfileReply,
} from '../../services/profileService';
import { color, layout, space } from '../../theme';
import { SegmentedTabs } from '../shared/SegmentedTabs';
import { EmptyState } from '../shared/EmptyState';
import { GlowButton } from '../shared/GlowButton';
import { UserIcon, VaultIcon } from '../shared/icons';
import { ProfileHeader } from './ProfileHeader';
import { ProfileClashRow, ProfileReplyItem, ProfileTakeItem } from './ProfileLists';
import { EditProfileSheet } from './EditProfileSheet';
import { SignOutSheet } from './SignOutSheet';
import { PostActionsSheet } from '../arena/PostActionsSheet';

type ProfileTab = 'takes' | 'replies' | 'clashes';

const TABS: readonly { key: ProfileTab; label: string }[] = [
  { key: 'takes', label: 'Takes' },
  { key: 'replies', label: 'Replies' },
  { key: 'clashes', label: 'Clashes' },
];

export interface ProfileScreenProps {
  profileId: string;
  /** When a parent route renders its own header bar, skip the top safe inset. */
  hideSafeTop?: boolean;
}

/** Full profile body — identity, follow counts, and the content archive. */
export function ProfileScreen({ profileId, hideSafeTop = false }: ProfileScreenProps): React.JSX.Element {
  const { dispatch, state } = useClash();
  const { signedIn } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const viewerId = signedIn ? state.viewer.id : null;
  const self = viewerId !== null && viewerId === profileId;

  const [profile, setProfile] = React.useState<User | null>(null);
  const [follow, setFollow] = React.useState<FollowState | null>(null);
  const [blocked, setBlocked] = React.useState(false);
  const [hasVault, setHasVault] = React.useState<boolean | null>(null);
  const [notFound, setNotFound] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);

  const [tab, setTab] = React.useState<ProfileTab>('takes');
  const [takes, setTakes] = React.useState<Take[] | null>(null);
  const [replies, setReplies] = React.useState<ProfileReply[] | null>(null);
  const [clashes, setClashes] = React.useState<ProfileClash[] | null>(null);
  const [opponents, setOpponents] = React.useState<Map<string, User>>(new Map());

  const [editOpen, setEditOpen] = React.useState(false);
  const [signOutOpen, setSignOutOpen] = React.useState(false);
  const [actionsOpen, setActionsOpen] = React.useState(false);

  const load = React.useCallback(async (): Promise<void> => {
    try {
      const [nextProfile, nextFollow, safety, nextVault] = await Promise.all([
        fetchProfileById(profileId),
        fetchFollowState(profileId),
        fetchViewerSafetyState(viewerId),
        fetchVault(profileId),
      ]);
      if (!nextProfile) {
        setNotFound(true);
        return;
      }
      setNotFound(false);
      setProfile(nextProfile);
      setFollow(nextFollow);
      setHasVault(nextVault !== null);
      setBlocked(safety.blockedProfileIds.includes(profileId));
    } catch (error) {
      dispatch(showNotice(errorText(error)));
    }
  }, [profileId, viewerId, dispatch]);

  const loadTakes = React.useCallback(async (): Promise<void> => {
    if (takes !== null) return;
    try {
      setTakes(await fetchProfileTakes(profileId));
    } catch (error) {
      dispatch(showNotice(errorText(error)));
    }
  }, [profileId, takes, dispatch]);

  const loadReplies = React.useCallback(async (): Promise<void> => {
    if (replies !== null) return;
    try {
      setReplies(await fetchProfileReplies(profileId));
    } catch (error) {
      dispatch(showNotice(errorText(error)));
    }
  }, [profileId, replies, dispatch]);

  const loadClashes = React.useCallback(async (): Promise<void> => {
    if (clashes !== null) return;
    try {
      const rows = await fetchProfileClashes(profileId);
      setClashes(rows);
      const ids = [...new Set(rows.map((row) => row.opponentId).filter((id): id is string => id !== null))];
      if (ids.length > 0) {
        const users = await fetchProfilesByIds(ids);
        setOpponents(new Map(users.map((user) => [user.id, user])));
      }
    } catch (error) {
      dispatch(showNotice(errorText(error)));
    }
  }, [profileId, clashes, dispatch]);

  React.useEffect(() => {
    setProfile(null);
    setTakes(null);
    setReplies(null);
    setClashes(null);
    setFollow(null);
    setBlocked(false);
    setNotFound(false);
    void load();
  }, [load]);

  React.useEffect(() => {
    if (tab === 'takes') void loadTakes();
    else if (tab === 'replies') void loadReplies();
    else void loadClashes();
  }, [tab, loadTakes, loadReplies, loadClashes]);

  const refresh = async (): Promise<void> => {
    setRefreshing(true);
    setTakes(null);
    setReplies(null);
    setClashes(null);
    await load();
    if (tab === 'takes') await loadTakes();
    else if (tab === 'replies') await loadReplies();
    else await loadClashes();
    setRefreshing(false);
  };

  const toggleFollow = async (): Promise<void> => {
    if (viewerId === null) {
      router.push('/auth');
      return;
    }
    if (!follow) return;
    try {
      if (follow.following) await unfollowUser(profileId);
      else await followUser(profileId);
      setFollow(await fetchFollowState(profileId));
    } catch (error) {
      dispatch(showNotice(errorText(error)));
    }
  };

  const onActionsMutated = async (): Promise<void> => {
    setFollow(await fetchFollowState(profileId));
    const safety = await fetchViewerSafetyState(viewerId);
    if (safety.blockedProfileIds.includes(profileId)) router.back();
  };

  if (notFound) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <EmptyState icon={UserIcon} title="Profile not found" body="This profile no longer exists or is unavailable." />
      </View>
    );
  }

  if (blocked) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <EmptyState icon={UserIcon} title="You blocked this user" body="Their profile and content are hidden." />
      </View>
    );
  }

  if (!profile || !follow) {
    return (
      <View style={[styles.screen, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator color="#FFFFFF" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor="#FFFFFF" />}
        contentContainerStyle={[styles.content, { paddingTop: hideSafeTop ? space.md : insets.top + space.md, paddingBottom: insets.bottom + space.xxl }]}
      >
        <ProfileHeader
          profile={profile}
          isSelf={self}
          following={follow.following}
          followerCount={follow.followerCount}
          followingCount={follow.followingCount}
          onEdit={() => setEditOpen(true)}
          onToggleFollow={() => void toggleFollow()}
          onMore={() => {
            if (self) setSignOutOpen(true);
            else if (viewerId === null) router.push('/auth');
            else setActionsOpen(true);
          }}
        />

        {hasVault !== null && (hasVault || self) ? (
          <GlowButton
            label={hasVault ? (self ? 'Manage Vault' : 'View Vault') : 'Start Vault'}
            icon={VaultIcon}
            tone={hasVault ? 'ink' : 'light'}
            compact
            onPress={() => {
              if (hasVault) {
                if (self) router.replace('/(vault)');
                else router.push(`/vault/${profileId}`);
              } else {
                router.replace('/(vault)');
              }
            }}
            style={styles.vaultEntry}
          />
        ) : null}

        <SegmentedTabs value={tab} items={TABS} onChange={setTab} label="Profile content" />

        {tab === 'takes' ? <TakesList takes={takes} onOpen={(id) => router.push(`/take/${id}`)} /> : null}
        {tab === 'replies' ? <RepliesList replies={replies} onOpen={(id) => router.push(`/take/${id}`)} /> : null}
        {tab === 'clashes' ? (
          <ClashesList clashes={clashes} opponents={opponents} onOpen={(id) => router.push(`/clash/${id}`)} />
        ) : null}
      </ScrollView>

      {self ? (
        <EditProfileSheet visible={editOpen} profile={profile} onClose={() => setEditOpen(false)} onSaved={() => void load()} />
      ) : (
        <PostActionsSheet
          visible={actionsOpen}
          target={profile}
          isSelf={self}
          following={follow.following}
          reportTarget={{ kind: 'profile', id: profile.id }}
          onClose={() => setActionsOpen(false)}
          onMutated={() => void onActionsMutated()}
        />
      )}
      <SignOutSheet visible={signOutOpen} onClose={() => setSignOutOpen(false)} />
    </View>
  );
}

function TakesList({ takes, onOpen }: { takes: Take[] | null; onOpen: (id: string) => void }): React.JSX.Element {
  if (takes === null) return <Spinner />;
  if (takes.length === 0) return <EmptyState icon={UserIcon} title="No Takes yet" body="Their Takes will appear here." />;
  return (
    <View>
      {takes.map((take) => (
        <ProfileTakeItem key={take.id} take={take} onOpen={() => onOpen(take.id)} />
      ))}
    </View>
  );
}

function RepliesList({ replies, onOpen }: { replies: ProfileReply[] | null; onOpen: (id: string) => void }): React.JSX.Element {
  if (replies === null) return <Spinner />;
  if (replies.length === 0) return <EmptyState icon={UserIcon} title="No replies yet" body="Their rebuttals will appear here." />;
  return (
    <View>
      {replies.map((reply) => (
        <ProfileReplyItem key={reply.comment.id} reply={reply} onOpen={() => onOpen(reply.comment.takeId)} />
      ))}
    </View>
  );
}

function ClashesList({
  clashes,
  opponents,
  onOpen,
}: {
  clashes: ProfileClash[] | null;
  opponents: Map<string, User>;
  onOpen: (id: string) => void;
}): React.JSX.Element {
  if (clashes === null) return <Spinner />;
  if (clashes.length === 0) return <EmptyState icon={UserIcon} title="No Clashes yet" body="Their Clash history will appear here." />;
  return (
    <View>
      {clashes.map((clash) => (
        <ProfileClashRow
          key={clash.clash.id}
          clash={clash}
          opponent={clash.opponentId ? opponents.get(clash.opponentId) : undefined}
          onOpen={() => onOpen(clash.clash.takeId)}
        />
      ))}
    </View>
  );
}

function Spinner(): React.JSX.Element {
  return (
    <View style={styles.spinner}>
      <ActivityIndicator color="#FFFFFF" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  centered: { justifyContent: 'center', alignItems: 'center' },
  content: { paddingHorizontal: layout.screenX, gap: space.lg },
  spinner: { paddingVertical: space.xxl, alignItems: 'center' },
  vaultEntry: { alignSelf: 'flex-start' },
});


