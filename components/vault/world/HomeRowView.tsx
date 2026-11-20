import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { VaultHomeDropCard, VaultHomeOfferCard } from '../../../services/vaultHomeService';
import type { HomeRow } from '../../../utils/vaultHomeRows';
import { space, typeScale, useThemeColors } from '../../../theme';
import { EmptyState } from '../../shared/EmptyState';
import { VaultIcon } from '../../shared/icons';
import { FeaturedWorld } from '../FeaturedWorld';
import { VaultActionButton } from '../VaultActionButton';
import { WorldRail } from '../WorldRail';
import { ChapterHeading } from './ChapterHeading';
import { EditorialMedia } from './EditorialMedia';
import { HomeOfferRow } from './HomeOfferRow';
import { PosterStrip } from './PosterStrip';
import { WorldCollage } from './WorldCollage';

export interface HomeRowViewProps {
  row: HomeRow;
  onEnterWorld: (creatorId: string) => void;
  onOpenDrop: (dropId: string) => void;
  onOpenOffer: (offer: VaultHomeOfferCard) => void;
  onDiscover: () => void;
}

function dropAccess(drop: VaultHomeDropCard): string {
  return drop.accessLevel === 'preview' ? 'PREVIEW' : 'FREE';
}

/** Renders one Vault Home row with the editorial world language. */
export const HomeRowView = React.memo(function HomeRowView({
  row,
  onEnterWorld,
  onOpenDrop,
  onOpenOffer,
  onDiscover,
}: HomeRowViewProps): React.JSX.Element | null {
  const t = useThemeColors();

  switch (row.kind) {
    case 'masthead':
    case 'scope':
      return null;
    case 'chapter':
      return <ChapterHeading title={row.title} />;
    case 'featured':
      return <FeaturedWorld creator={row.creator} onEnter={() => onEnterWorld(row.creator.creatorId)} />;
    case 'collage':
      return <WorldCollage worlds={row.worlds} onEnter={onEnterWorld} />;
    case 'rail':
      return <WorldRail creators={row.items} onEnter={onEnterWorld} />;
    case 'today':
      return (
        <EditorialMedia
          mediaUrl={row.drop.mediaUrl}
          accent={row.drop.authorTint}
          height={340}
          radius={4}
          kicker={`DROP · ${dropAccess(row.drop)}`}
          title={row.drop.caption}
          meta={`@${row.drop.authorHandle}`}
          onPress={() => onOpenDrop(row.drop.dropId)}
        />
      );
    case 'dropStrip':
      return (
        <PosterStrip
          items={row.drops.map((drop) => ({
            id: drop.dropId,
            title: drop.caption,
            mediaUrl: drop.mediaUrl,
            tint: drop.authorTint,
            meta: dropAccess(drop),
          }))}
          onOpen={onOpenDrop}
        />
      );
    case 'courses':
    case 'services':
    case 'products':
      return <HomeOfferRow row={row} onOpenOffer={onOpenOffer} />;
    case 'empty_following':
      return (
        <View style={styles.quiet}>
          <Text allowFontScaling={false} style={[styles.quietTitle, { color: t.textPrimary }]}>
            Your Vault is quiet
          </Text>
          <Text allowFontScaling={false} style={[styles.quietBody, { color: t.textMuted }]}>
            Follow creators to see their Drops, Collections and experiences here.
          </Text>
          <VaultActionButton label="Discover creators" onPress={onDiscover} />
        </View>
      );
    case 'empty_discover':
      return (
        <EmptyState
          icon={VaultIcon}
          title="Worlds are quiet"
          body="Published Creator Worlds will appear here when creators share free or preview work."
        />
      );
    default:
      return null;
  }
});

const styles = StyleSheet.create({
  quiet: { alignItems: 'center', gap: space.md, paddingVertical: space.xxl },
  quietTitle: { ...typeScale.section, fontWeight: '800', textAlign: 'center' },
  quietBody: { ...typeScale.body, textAlign: 'center', maxWidth: 300 },
});