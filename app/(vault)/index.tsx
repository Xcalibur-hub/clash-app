import React from 'react';
import { CreatorVaultHome } from '../../components/vault/CreatorVaultHome';
import { Notice } from '../../components/shared/Notice';

/** Your Vault — the Drops tab (creator perspective). */
export default function VaultDropsScreen(): React.JSX.Element {
  return (
    <>
      <CreatorVaultHome />
      <Notice offset={0} />
    </>
  );
}
