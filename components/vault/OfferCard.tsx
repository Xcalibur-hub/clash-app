import React from 'react';
import type { VaultOfferAccess } from '../../utils/vaultMoney';
import { CourseMasterclassCard } from './CourseMasterclassCard';
import { ServiceSessionCard } from './ServiceSessionCard';
import { ProductArtifactCard } from './ProductArtifactCard';

export interface OfferCardProps {
  kind: 'SERVICE' | 'COURSE' | 'PRODUCT';
  title: string;
  subtitle?: string | null;
  coverUrl?: string | null;
  accessType: VaultOfferAccess;
  priceAmountMinor: number | null;
  currency: string | null;
  externalUrl?: string | null;
  creatorName?: string | null;
  lessonCount?: number | null;
  onOpen: () => void;
}

/**
 * Compatibility dispatcher — routes each offer kind to a distinct visual treatment.
 * Prefer the specific cards when composing new screens.
 */
export const OfferCard = React.memo(function OfferCard({
  kind,
  title,
  subtitle,
  coverUrl,
  accessType,
  priceAmountMinor,
  currency,
  externalUrl,
  creatorName,
  lessonCount,
  onOpen,
}: OfferCardProps): React.JSX.Element {
  if (kind === 'COURSE') {
    return (
      <CourseMasterclassCard
        title={title}
        lessonCount={lessonCount}
        coverUrl={coverUrl}
        accessType={accessType}
        priceAmountMinor={priceAmountMinor}
        currency={currency}
        creatorName={creatorName}
        onOpen={onOpen}
      />
    );
  }
  if (kind === 'SERVICE') {
    return (
      <ServiceSessionCard
        title={title}
        subtitle={subtitle}
        coverUrl={coverUrl}
        accessType={accessType}
        priceAmountMinor={priceAmountMinor}
        currency={currency}
        creatorName={creatorName}
        onOpen={onOpen}
      />
    );
  }
  return (
    <ProductArtifactCard
      title={title}
      coverUrl={coverUrl}
      accessType={accessType}
      priceAmountMinor={priceAmountMinor}
      currency={currency}
      externalUrl={externalUrl}
      creatorName={creatorName}
      onOpen={onOpen}
    />
  );
});
