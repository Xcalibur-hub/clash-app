import React from 'react';
import { CreatorStudio } from '../../components/vault/CreatorStudio';
import { Notice } from '../../components/shared/Notice';

/** Creator manage surface — Drops, Services, Courses, Shop. */
export default function VaultStudioScreen(): React.JSX.Element {
  return (
    <>
      <CreatorStudio />
      <Notice offset={0} />
    </>
  );
}
