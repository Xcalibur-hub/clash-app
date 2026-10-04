import React from 'react';
import type { VaultCreatorWorldCard } from '../../services/vaultHomeService';
import { creatorIdentityLine, worldHappeningLine, worldStackLayout } from '../../utils/vaultPresentation';
import { FeaturedWorld } from './FeaturedWorld';
import { VaultMediaTile } from './VaultMediaTile';

export interface CreatorWorldCardProps {
  creator: VaultCreatorWorldCard;
  onEnter: () => void;
  featured?: boolean;
  index?: number;
}

/**
 * Compatibility wrapper — FeaturedWorld / VaultMediaTile.
 */
export const CreatorWorldCard = React.memo(function CreatorWorldCard({
  creator,
  onEnter,
  featured = false,
  index = 1,
}: CreatorWorldCardProps): React.JSX.Element {
  if (featured) {
    return <FeaturedWorld creator={creator} onEnter={onEnter} />;
  }
  const layout = worldStackLayout(index);
  const span = layout === 'portrait' ? 'portrait' : layout === 'wide' ? 'wide' : 'hero';
  return (
    <VaultMediaTile
      kind="WORLD"
      title={creator.name}
      subtitle={worldHappeningLine(creator) ?? creatorIdentityLine(creator.bio)}
      mediaUrl={creator.mediaUrl}
      accent={creator.tint}
      span={span}
      height={span === 'portrait' ? 220 : span === 'wide' ? 168 : 248}
      onPress={onEnter}
    />
  );
});
