import React from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { HOOD_LABEL } from '../../data/hoods';
import { fetchPopularTakes } from '../../services/searchService';
import { selectAuthor, useClash, type Take } from '../../store';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { compact } from '../../utils/format';
import { tap as hapticTap } from '../../utils/haptics';
import { PressableScale } from '../shared/PressableScale';
import { ExploreHeading } from './ExploreHeading';

/**
 * Trending discovery rail — editorial horizontal cards from real heat ranking.
 */
export function PopularTakesSection(): React.JSX.Element | null {
  const router = useRouter();
  const { state } = useClash();
  const t = useThemeColors();
  const [takes, setTakes] = React.useState<Take[] | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    setFailed(false);
    fetchPopularTakes(8)
      .then((rows) => {
        if (active) setTakes(rows);
      })
      .catch(() => {
        if (active) {
          setTakes([]);
          setFailed(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const open = (id: string): void => {
    hapticTap();
    router.push(`/take/${id}`);
  };

  if (takes === null) {
    return (
      <View style={styles.section}>
        <ExploreHeading title="Trending now" marked />
        <ActivityIndicator color={t.textMuted} style={styles.spinner} />
      </View>
    );
  }

  if (failed) {
    return (
      <View style={styles.section}>
        <ExploreHeading title="Trending now" marked />
        <Text allowFontScaling={false} style={[styles.empty, { color: t.textMuted }]}>
          Couldn’t load trending takes.
        </Text>
      </View>
    );
  }

  if (takes.length === 0) return null;

  return (
    <View style={styles.section}>
      <ExploreHeading title="Trending now" marked />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={268}
        contentContainerStyle={styles.rail}
      >
        {takes.map((take, index) => {
          const author = selectAuthor(state, take.authorId);
          const mediaUrl = take.media?.kind === 'image' && take.media.url ? take.media.url : undefined;
          const textOnly = !take.media;
          return (
            <PressableScale
              key={take.id}
              onPress={() => open(take.id)}
              accessibilityRole="button"
              accessibilityLabel={`Trending take by ${author?.handle ?? 'unknown'}`}
              style={[
                styles.card,
                {
                  backgroundColor: textOnly
                    ? t.scheme === 'light'
                      ? '#1C1916'
                      : t.surfaceElevated
                    : '#0C0C10',
                  shadowColor: t.shadowColor,
                  shadowOpacity: t.scheme === 'light' ? 0.12 : 0.35,
                },
                index === 0 && styles.cardLead,
              ]}
            >
              {mediaUrl ? (
                <Image source={{ uri: mediaUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              ) : take.media ? (
                <LinearGradient
                  colors={take.media.colors}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
              ) : (
                <LinearGradient
                  colors={
                    t.scheme === 'light'
                      ? ['rgba(201,169,106,0.22)', 'transparent', 'rgba(8,8,11,0.55)']
                      : ['rgba(201,169,106,0.14)', 'transparent', 'rgba(0,0,0,0.4)']
                  }
                  locations={[0, 0.45, 1]}
                  style={StyleSheet.absoluteFill}
                />
              )}
              <LinearGradient
                colors={['transparent', 'rgba(8,8,11,0.35)', 'rgba(8,8,11,0.92)']}
                locations={[0.35, 0.62, 1]}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
              <View style={styles.meta}>
                <Text allowFontScaling={false} style={styles.hood} numberOfLines={1}>
                  {HOOD_LABEL[take.hood]}
                </Text>
                <Text allowFontScaling style={styles.headline} numberOfLines={textOnly ? 4 : 3}>
                  {take.text}
                </Text>
                <Text allowFontScaling={false} style={styles.byline} numberOfLines={1}>
                  @{author?.handle ?? 'unknown'} · {compact(take.reactions)} reactions
                </Text>
              </View>
            </PressableScale>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.md },
  rail: { gap: 12, paddingRight: 4 },
  card: {
    width: 256,
    height: 320,
    borderRadius: 24,
    overflow: 'hidden',
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  cardLead: { width: 272 },
  meta: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: space.md,
    gap: 5,
  },
  hood: {
    ...typeScale.caption,
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.85)',
    textTransform: 'uppercase',
  },
  headline: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '800',
    letterSpacing: -0.35,
    color: '#FFFFFF',
  },
  byline: {
    ...typeScale.meta,
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
  },
  spinner: { paddingVertical: space.lg },
  empty: { ...typeScale.meta, paddingVertical: space.sm },
});
