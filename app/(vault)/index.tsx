import React from 'react';
import { VaultHome } from '../../components/vault/VaultHome';
import { Notice } from '../../components/shared/Notice';

/** Vault realm home — Creator Worlds. */
export default function VaultWorldsScreen(): React.JSX.Element {
  return (
    <>
      <VaultHome />
      <Notice offset={0} />
    </>
  );
}
