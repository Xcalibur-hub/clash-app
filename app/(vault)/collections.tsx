import React from 'react';
import { CreatorCollections } from '../../components/vault/CreatorCollections';
import { Notice } from '../../components/shared/Notice';

/** Your Vault — the Collections tab (creator perspective). */
export default function VaultCollectionsScreen(): React.JSX.Element {
  return (
    <>
      <CreatorCollections />
      <Notice offset={0} />
    </>
  );
}
