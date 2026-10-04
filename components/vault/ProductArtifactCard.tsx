import React from 'react';
import { vaultOfferPriceLabel, type VaultOfferAccess } from '../../utils/vaultMoney';
import { VaultMediaTile } from './VaultMediaTile';

export interface ProductArtifactCardProps {
  title: string;
  coverUrl?: string | null;
  accessType: VaultOfferAccess;
  priceAmountMinor: number | null;
  currency: string | null;
  externalUrl?: string | null;
  creatorName?: string | null;
  onOpen: () => void;
}

/** Creator artifact — Explore product-card energy, not ecommerce grid. */
export const ProductArtifactCard = React.memo(function ProductArtifactCard({
  title,
  coverUrl,
  accessType,
  priceAmountMinor,
  currency,
  externalUrl,
  creatorName,
  onOpen,
}: ProductArtifactCardProps): React.JSX.Element {
  const price = vaultOfferPriceLabel({ accessType, priceAmountMinor, currency, externalUrl });

  return (
    <VaultMediaTile
      kind="ARTIFACT"
      title={title}
      subtitle={creatorName ? `from ${creatorName}` : null}
      meta={`${price} · View →`}
      mediaUrl={coverUrl}
      span="wide"
      height={200}
      onPress={onOpen}
    />
  );
});
