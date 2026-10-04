import React from 'react';
import type { VaultHomeDropCard } from '../../services/vaultHomeService';
import { vaultAccessMeta } from '../../utils/vaultPresentation';
import { VaultMediaTile } from './VaultMediaTile';

export interface TodaysDropCardProps {
  drop: VaultHomeDropCard;
  onOpen: () => void;
  large?: boolean;
}

/** Drop presentation via Explore-aligned media tile. */
export const TodaysDropCard = React.memo(function TodaysDropCard({
  drop,
  onOpen,
  large = true,
}: TodaysDropCardProps): React.JSX.Element {
  const access = vaultAccessMeta(drop.accessLevel);
  return (
    <VaultMediaTile
      kind={access === 'PREVIEW' ? 'PREVIEW' : 'DROP'}
      title={drop.caption}
      subtitle={`@${drop.authorHandle}`}
      meta={access}
      mediaUrl={drop.mediaUrl}
      accent={drop.authorTint}
      span={large ? 'hero' : 'portrait'}
      height={large ? 320 : 220}
      onPress={onOpen}
    />
  );
});
