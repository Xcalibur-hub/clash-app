import React from 'react';
import type { VaultCreatorWorldCard } from '../../services/vaultHomeService';
import { worldStackLayout } from '../../utils/vaultPresentation';
import { FeaturedWorld } from './FeaturedWorld';
import { EditorialWorldTile } from './EditorialWorldTile';

export interface CreatorWorldCardProps {
  creator: VaultCreatorWorldCard;
  onEnter: () => void;
  featured?: boolean;
}

/**
 * Compatibility wrapper — prefer FeaturedWorld / EditorialWorldTile directly.
 * Kept so older call sites keep working with the new visual system.
 */
export const CreatorWorldCard = React.memo(function CreatorWorldCard({
  creator,
  onEnter,
  featured = false,
}: CreatorWorldCardProps): React.JSX.Element {
  if (featured) {
    return <FeaturedWorld creator={creator} onEnter={onEnter} />;
  }
  const layout = worldStackLayout(1);
  return (
    <EditorialWorldTile
      creator={creator}
      layout={layout === 'featured' ? 'wide' : layout}
      onEnter={onEnter}
    />
  );
});
