import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { VaultScreen } from '../../components/vault/VaultScreen';

/** The public creator Vault (viewer perspective). */
export default function VaultRoute(): React.JSX.Element {
  const { creatorId } = useLocalSearchParams<{ creatorId?: string | string[] }>();
  const id = typeof creatorId === 'string' ? creatorId : '';
  return <VaultScreen creatorId={id} />;
}
