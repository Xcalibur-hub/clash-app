import React from 'react';
import { vaultOfferPriceLabel, type VaultOfferAccess } from '../../utils/vaultMoney';
import { VaultMediaTile } from './VaultMediaTile';

export interface CourseMasterclassCardProps {
  title: string;
  lessonCount?: number | null;
  coverUrl?: string | null;
  accessType: VaultOfferAccess;
  priceAmountMinor: number | null;
  currency: string | null;
  creatorName?: string | null;
  onOpen: () => void;
}

/** Masterclass tile — Explore destination-card quality. */
export const CourseMasterclassCard = React.memo(function CourseMasterclassCard({
  title,
  lessonCount,
  coverUrl,
  accessType,
  priceAmountMinor,
  currency,
  creatorName,
  onOpen,
}: CourseMasterclassCardProps): React.JSX.Element {
  const price = vaultOfferPriceLabel({ accessType, priceAmountMinor, currency });
  const lessons =
    lessonCount != null && lessonCount > 0
      ? `${lessonCount} lesson${lessonCount === 1 ? '' : 's'}`
      : null;

  return (
    <VaultMediaTile
      kind="COURSE"
      title={title}
      subtitle={creatorName ? `with ${creatorName}` : null}
      meta={[lessons, price].filter(Boolean).join(' · ') || price}
      mediaUrl={coverUrl}
      span="hero"
      height={280}
      onPress={onOpen}
    />
  );
});
