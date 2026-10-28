import { withReleaseAdmission } from '../../components/shared/ReleaseUnavailable';
import React from 'react';
import { DropComposer } from '../../components/vault/DropComposer';
import { Notice } from '../../components/shared/Notice';

/** Compose a Drop: access level, media, caption, then draft or publish. */
function VaultComposeRoute(): React.JSX.Element {
  return (
    <>
      <DropComposer />
      <Notice offset={0} />
    </>
  );
}

export default withReleaseAdmission(VaultComposeRoute, 'creator');
