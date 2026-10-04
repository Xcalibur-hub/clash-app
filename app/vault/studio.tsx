import React from 'react';
import { CreatorVaultHome } from '../../components/vault/CreatorVaultHome';
import { Notice } from '../../components/shared/Notice';

/** Creator manage surface — create Vault / Drops without replacing Worlds home. */
export default function VaultStudioScreen(): React.JSX.Element {
  return (
    <>
      <CreatorVaultHome />
      <Notice offset={0} />
    </>
  );
}
