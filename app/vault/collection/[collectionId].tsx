import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { CollectionWorld } from '../../../components/vault/CollectionWorld';

export default function VaultCollectionScreen(): React.JSX.Element {
  const { collectionId } = useLocalSearchParams<{ collectionId: string }>();
  const id = typeof collectionId === 'string' ? collectionId : '';
  return <CollectionWorld collectionId={id} />;
}
