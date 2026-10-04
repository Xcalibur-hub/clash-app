/**
 * Discover world mosaic — Explore For You rhythm, Vault content.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { VaultCreatorWorldCard } from '../../services/vaultHomeService';
import { creatorIdentityLine, worldHappeningLine } from '../../utils/vaultPresentation';
import { packVaultWorldMosaicRows } from '../../utils/vaultWorldMosaic';
import { space } from '../../theme';
import { VaultMediaTile } from './VaultMediaTile';

export interface VaultWorldMosaicProps {
  worlds: readonly VaultCreatorWorldCard[];
  onEnter: (creatorId: string) => void;
}

function tileProps(creator: VaultCreatorWorldCard) {
  return {
    id: creator.creatorId,
    kind: 'WORLD',
    title: creator.name,
    subtitle: worldHappeningLine(creator) ?? creatorIdentityLine(creator.bio),
    mediaUrl: creator.mediaUrl,
    accent: creator.tint,
  };
}

export const VaultWorldMosaic = React.memo(function VaultWorldMosaic({
  worlds,
  onEnter,
}: VaultWorldMosaicProps): React.JSX.Element {
  const items = worlds.map(tileProps);
  const rows = packVaultWorldMosaicRows(items);

  return (
    <View style={styles.wrap}>
      {rows.map((row) => {
        if (row.type === 'feature') {
          return (
            <View key={row.key} style={styles.feature}>
              <VaultMediaTile
                kind={row.large.kind}
                title={row.large.title}
                subtitle={row.large.subtitle}
                mediaUrl={row.large.mediaUrl}
                accent={row.large.accent}
                span="hero"
                fill
                style={styles.featureLarge}
                onPress={() => onEnter(row.large.id)}
              />
              <View style={styles.featureStack}>
                <VaultMediaTile
                  kind={row.smallTop.kind}
                  title={row.smallTop.title}
                  subtitle={row.smallTop.subtitle}
                  mediaUrl={row.smallTop.mediaUrl}
                  accent={row.smallTop.accent}
                  span="half"
                  fill
                  onPress={() => onEnter(row.smallTop.id)}
                />
                <VaultMediaTile
                  kind={row.smallBottom.kind}
                  title={row.smallBottom.title}
                  subtitle={row.smallBottom.subtitle}
                  mediaUrl={row.smallBottom.mediaUrl}
                  accent={row.smallBottom.accent}
                  span="half"
                  fill
                  onPress={() => onEnter(row.smallBottom.id)}
                />
              </View>
            </View>
          );
        }
        if (row.type === 'pair') {
          return (
            <View key={row.key} style={styles.pair}>
              <VaultMediaTile
                kind={row.left.kind}
                title={row.left.title}
                subtitle={row.left.subtitle}
                mediaUrl={row.left.mediaUrl}
                accent={row.left.accent}
                span="portrait"
                fill
                onPress={() => onEnter(row.left.id)}
              />
              <VaultMediaTile
                kind={row.right.kind}
                title={row.right.title}
                subtitle={row.right.subtitle}
                mediaUrl={row.right.mediaUrl}
                accent={row.right.accent}
                span="portrait"
                fill
                onPress={() => onEnter(row.right.id)}
              />
            </View>
          );
        }
        return (
          <VaultMediaTile
            key={row.key}
            kind={row.item.kind}
            title={row.item.title}
            subtitle={row.item.subtitle}
            mediaUrl={row.item.mediaUrl}
            accent={row.item.accent}
            span="wide"
            onPress={() => onEnter(row.item.id)}
            style={styles.single}
          />
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  feature: {
    flexDirection: 'row',
    gap: space.xs,
    minHeight: 248,
  },
  featureLarge: { flex: 1.2 },
  featureStack: { flex: 0.8, gap: space.xs },
  pair: {
    flexDirection: 'row',
    gap: space.xs,
  },
  single: { marginBottom: 0 },
});
