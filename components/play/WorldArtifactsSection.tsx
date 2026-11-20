import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { fetchMyWorldArtifacts, creatorDropMediaUrl } from '../../services/creatorWorldDropService';
import type { WorldArtifact } from '../../services/creatorWorldDropMappers';
import { artifactCountLabel, dropTypeLabel, rewardTypeLabel } from '../../utils/creatorWorldDrops';
import { radius, space, typeScale, useThemeColors } from '../../theme';

/** Lightweight artifact shelf — discovered Creator World Drops (not an inventory). */
export function WorldArtifactsSection(): React.JSX.Element | null {
  const t = useThemeColors();
  const router = useRouter();
  const [items, setItems] = React.useState<WorldArtifact[] | null>(null);

  React.useEffect(() => {
    let alive = true;
    void fetchMyWorldArtifacts(40)
      .then((next) => {
        if (alive) setItems(next);
      })
      .catch(() => {
        if (alive) setItems([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (items === null || items.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text allowFontScaling={false} style={[styles.sectionTitle, { color: t.textPrimary }]}>
        Artifacts
      </Text>
      <Text allowFontScaling={false} style={[styles.count, { color: t.textMuted }]}>
        {artifactCountLabel(items.length)}
      </Text>
      <View style={styles.grid}>
        {items.map((artifact) => {
          const mediaUrl = creatorDropMediaUrl(artifact.media);
          return (
            <Pressable
              key={artifact.dropId}
              onPress={() => router.push(`/world/drop/${artifact.dropId}` as never)}
              style={[styles.tile, { borderColor: t.border, backgroundColor: t.surfaceElevated }]}
            >
              {mediaUrl ? (
                <Image source={{ uri: mediaUrl }} style={styles.tileMedia} />
              ) : (
                <LinearGradient
                  colors={[artifact.creatorTint ?? '#2A2438', '#121214']}
                  style={styles.tileMedia}
                />
              )}
              <View style={styles.tileCopy}>
                <Text allowFontScaling={false} style={[styles.tileKicker, { color: t.textMuted }]}>
                  {dropTypeLabel(artifact.dropType).toUpperCase()}
                </Text>
                <Text allowFontScaling={false} style={[styles.tileTitle, { color: t.textPrimary }]} numberOfLines={2}>
                  {artifact.caption}
                </Text>
                <Text allowFontScaling={false} style={{ color: t.textMuted }} numberOfLines={1}>
                  {[rewardTypeLabel(artifact.rewardType), artifact.creatorName].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  sectionTitle: { fontFamily: typeScale.section.fontFamily, fontSize: 17, fontWeight: '700' },
  count: { ...typeScale.caption },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: {
    width: '48%',
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  tileMedia: { width: '100%', height: 110 },
  tileCopy: { padding: space.sm, gap: 4 },
  tileKicker: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  tileTitle: { fontWeight: '700', fontSize: 14 },
});