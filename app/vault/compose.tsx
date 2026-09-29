import React from 'react';
import { DropComposer } from '../../components/vault/DropComposer';
import { Notice } from '../../components/shared/Notice';

/** Compose a Drop: access level, media, caption, then draft or publish. */
export default function VaultComposeRoute(): React.JSX.Element {
  return (
    <>
      <DropComposer />
      <Notice offset={0} />
    </>
  );
}
