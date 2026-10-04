import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { CommunityScreen } from '../../../components/vault/community/CommunityScreen';

/** A creator's Community, living inside their Creator World. */
export default function VaultCommunityRoute(): React.JSX.Element {
  const { communityId } = useLocalSearchParams<{ communityId?: string | string[] }>();
  const id = typeof communityId === 'string' ? communityId : '';
  return <CommunityScreen communityId={id} />;
}
