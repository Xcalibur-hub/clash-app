import React from 'react';
import { Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../store/AuthProvider';
import { fetchProfileClashes } from '../../services/profileService';
import { useRetryableRead } from '../../hooks/useRetryableRead';
import { space, useThemeColors } from '../../theme';
import { ProfileClashRow } from '../profile/ProfileLists';
import { ReadFeedback } from '../shared/ReadFeedback';
import { EmptyState } from '../shared/EmptyState';
import { TrophyIcon } from '../shared/icons';

export function VaultWins({ profileId }: { profileId: string }): React.JSX.Element {
  const { user, loading } = useAuth(), router = useRouter(), t = useThemeColors();
  const load = React.useCallback(() => fetchProfileClashes(profileId), [profileId]);
  const history = useRetryableRead(load, !loading && user ? `${user.id}:${profileId}` : null);
  if (loading) return <ReadFeedback status="loading" subject="Clash wins" retry={history.retry} />;
  if (!user) return <EmptyState icon={TrophyIcon} title="Your Clash wins" body="Sign in to view your authorized Clash history."
    actionLabel="Sign in" onAction={() => router.push('/auth')} />;
  if (history.status !== 'ready') return <ReadFeedback status={history.status} subject="Clash wins" retry={history.retry} />;
  const wins = (history.data ?? []).filter(row => row.clash.status === 'settled' && row.verdict && row.outcome === 'won');
  return <>
    <Text style={{ color: t.textMuted, marginTop: space.sm }}>Wins in your available Clash history.</Text>
    {wins.length === 0 ? <EmptyState icon={TrophyIcon} title="No wins in available history" body="No settled wins were returned for this account." /> : null}
    {wins.map(row => <ProfileClashRow key={row.clash.id} clash={row} opponent={undefined}
      onOpen={() => router.push(`/clash/${row.clash.takeId}`)} />)}
  </>;
}
