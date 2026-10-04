import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { VaultHomeOfferCard } from '../../../services/vaultHomeService';
import type { HomeRow } from '../../../utils/vaultHomeRows';
import { space } from '../../../theme';
import { EditorialMedia } from './EditorialMedia';
import { GalleryShelf } from './GalleryShelf';
import { SessionInvite } from './SessionInvite';

export type HomeOfferRowKind = Extract<HomeRow, { kind: 'courses' | 'services' | 'products' }>;

export interface HomeOfferRowProps {
  row: HomeOfferRowKind;
  onOpenOffer: (offer: VaultHomeOfferCard) => void;
}

const byId = (offers: readonly VaultHomeOfferCard[], id: string): VaultHomeOfferCard | undefined =>
  offers.find((offer) => offer.id === id);

/** Learn / sessions / shelf sections of Vault Home. */
export const HomeOfferRow = React.memo(function HomeOfferRow({
  row,
  onOpenOffer,
}: HomeOfferRowProps): React.JSX.Element {
  if (row.kind === 'courses') {
    return (
      <View style={styles.stack}>
        {row.offers.map((offer, index) => (
          <EditorialMedia
            key={offer.id}
            mediaUrl={offer.coverUrl}
            accent={null}
            height={300}
            radius={10}
            badge={String(index + 1).padStart(2, '0')}
            kicker="MASTERCLASS"
            title={offer.title}
            meta={[offer.authorName, offer.subtitle].filter(Boolean).join(' · ')}
            onPress={() => onOpenOffer(offer)}
          />
        ))}
      </View>
    );
  }

  if (row.kind === 'services') {
    return (
      <SessionInvite
        items={row.offers.map((offer) => ({
          id: offer.id,
          title: offer.title,
          subtitle: offer.subtitle,
          mediaUrl: offer.coverUrl,
          tint: null,
          meta: offer.authorName,
        }))}
        creatorName={row.offers[0]?.authorName ?? 'a creator'}
        onOpen={(id) => {
          const offer = byId(row.offers, id);
          if (offer) onOpenOffer(offer);
        }}
      />
    );
  }

  return (
    <GalleryShelf
      items={row.offers.map((offer) => ({
        id: offer.id,
        title: offer.title,
        mediaUrl: offer.coverUrl,
        tint: null,
        meta: offer.authorName,
      }))}
      onOpen={(id) => {
        const offer = byId(row.offers, id);
        if (offer) onOpenOffer(offer);
      }}
    />
  );
});

const styles = StyleSheet.create({
  stack: { gap: space.lg },
});
