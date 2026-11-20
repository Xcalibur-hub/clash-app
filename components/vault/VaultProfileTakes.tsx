import React from 'react';
import { Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../store/AuthProvider';
import { fetchProfileTakes } from '../../services/profileService';
import { useRetryableRead } from '../../hooks/useRetryableRead';
import { useOperationScope } from '../../hooks/useOperationScope';
import { useThemeColors } from '../../theme';
import { TakeMiniCard } from '../profile/TakeMiniCard';
import { ReadFeedback } from '../shared/ReadFeedback';
import { EmptyState } from '../shared/EmptyState';
import { ArenaIcon } from '../shared/icons';

/** Same authorized, bounded history read as Arena Profile, including expired Takes. */
export function VaultProfileTakes({ profileId }: { profileId: string }): React.JSX.Element {
  const { user, loading } = useAuth(), router = useRouter(), t = useThemeColors();
  const scope = !loading && user ? `${user.id}:${profileId}` : null;
  const isCurrent = useOperationScope(scope ?? 'guest');
  const load = React.useCallback(() => fetchProfileTakes(profileId), [profileId]);
  const history = useRetryableRead(load, scope);
  if (loading) return <ReadFeedback status="loading" subject="Take history" retry={history.retry} />;
  if (!user) return <EmptyState icon={ArenaIcon} title="Your Take history" body="Sign in to read your authorized Take history."
    actionLabel="Sign in" onAction={() => { if (isCurrent()) router.push('/auth'); }} />;
  if (history.status !== 'ready') return <ReadFeedback status={history.status} subject="Take history" retry={history.retry} />;
  return <>
    <Text style={{ color: t.textMuted }}>Recent Takes in your available profile history, including expired Takes.</Text>
    {(history.data ?? []).map(take => <TakeMiniCard key={take.id} take={take} now={Date.now()}
      onPress={() => { if (isCurrent()) router.push(`/take/${take.id}`); }} />)}
    {history.data?.length === 0 ? <EmptyState icon={ArenaIcon} title="No Takes in available history" body="Explore conversations in Arena."
      actionLabel="Open Arena" onAction={() => { if (isCurrent()) router.push('/(tabs)'); }} /> : null}
  </>;
}
