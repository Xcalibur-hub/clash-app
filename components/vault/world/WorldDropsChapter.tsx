import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { WorldDropChapterItem } from '../../../utils/vaultWorldRows';
import { dropTypeLabel, hiddenChapterLine } from '../../../utils/creatorWorldDrops';
import { radius, space, typeScale, useThemeColors } from '../../../theme';
import { CompassIcon } from '../../shared/icons';
import { VaultActionButton } from '../VaultActionButton';
import { EditorialMedia } from './EditorialMedia';
import { PosterStrip } from './PosterStrip';

export interface WorldDropsChapterProps {
  items: readonly WorldDropChapterItem[];
  isSelf: boolean;
  tint?: string | null;
  onOpen: (dropId: string) => void;
  onFind: () => void;
  onManage: () => void;
}

const TILT = [-4, 2, -2];

/**
 * "HIDDEN IN THE WORLD" — a small constellation of artifact frames over a dark
 * plane. Deliberately not another generic card.
 */
export const WorldDropsChapter = React.memo(function WorldDropsChapter({
  items,
  isSelf,
  tint,
  onOpen,
  onFind,
  onManage,
}: WorldDropsChapterProps): React.JSX.Element | null {
  const t = useThemeColors();
  if (items.length === 0) return null;
  const rest = items.slice(3);
  const artifacts = items.slice(0, 3);

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.panel,
          {
            backgroundColor: t.scheme === 'light' ? '#1B1B1E' : '#0E0E12',
            borderColor: t.border,
          },
        ]}
      >
        <View style={styles.head}>
          <CompassIcon size={15} color="rgba(250,250,248,0.7)" strokeWidth={2.2} />
          <Text allowFontScaling={false} style={styles.kicker}>
            HIDDEN IN THE WORLD
          </Text>
        </View>
        <Text allowFontScaling={false} style={styles.count}>
          {hiddenChapterLine(items.length)}
        </Text>
        <View style={styles.artifacts}>
          {artifacts.map((item, index) => (
            <View
              key={item.id}
              style={[
                styles.artifact,
                {
                  marginLeft: index === 0 ? 0 : -26,
                  transform: [{ rotate: `${TILT[index % TILT.length]}deg` }],
                  zIndex: artifacts.length - index,
                },
              ]}
            >
              <EditorialMedia
                mediaUrl={item.mediaUrl}
                accent={item.tint ?? tint ?? null}
                height={132}
                width={96}
                radius={6}
                hairline
                onPress={() => onOpen(item.id)}
              />
            </View>
          ))}
        </View>
        <Text allowFontScaling={false} style={styles.types} numberOfLines={1}>
          {Array.from(new Set(items.map((item) => dropTypeLabel(item.type)))).join(' · ')}
        </Text>
        <View style={styles.action}>
          <VaultActionButton
            label={isSelf ? 'Place a World Drop' : 'FIND THEM →'}
            tone="quiet"
            compact
            overMedia
            onPress={isSelf ? onManage : onFind}
          />
        </View>
      </View>

      {rest.length > 0 ? (
        <PosterStrip
          items={rest.map((item) => ({
            id: item.id,
            title: item.caption,
            mediaUrl: item.mediaUrl,
            tint: item.tint,
            meta: item.place ?? dropTypeLabel(item.type),
          }))}
          onOpen={onOpen}
        />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: space.lg },
  panel: {
    gap: space.sm,
    padding: space.lg,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kicker: { ...typeScale.caption, fontSize: 10, fontWeight: '800', letterSpacing: 1.4, color: 'rgba(250,250,248,0.72)' },
  count: { ...typeScale.display, fontSize: 26, lineHeight: 29, fontWeight: '800', letterSpacing: -0.8, color: '#FAFAF8' },
  artifacts: { flexDirection: 'row', alignItems: 'flex-end', marginTop: space.sm, marginBottom: space.xs },
  artifact: { borderRadius: 6 },
  types: { ...typeScale.caption, fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: 'rgba(250,250,248,0.6)' },
  action: { marginTop: space.xs },
});