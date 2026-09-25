import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HOOD_LABEL } from '../../data/hoods';
import { useClock } from '../../hooks/useClock';
import { selectAuthor, useClash } from '../../store';
import { action, color, duel, ink, radius, space, typeScale } from '../../theme';
import { compact, timeLeftLabel } from '../../utils/format';
import { press as hapticPress } from '../../utils/haptics';
import { Avatar } from '../../components/shared/Avatar';
import { BackIcon, ZapIcon } from '../../components/shared/icons';
import { TakeMedia } from '../../components/arena/TakeMedia';

/** Flat, content-only Take detail target used by the Arena feed. */
export default function TakeDetailScreen(): React.JSX.Element {
  const { takeId } = useLocalSearchParams<{ takeId: string | string[] }>();
  const id = Array.isArray(takeId) ? takeId[0] : takeId;
  const { state } = useClash();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const now = useClock();
  const take = state.takes.find((item) => item.id === id);
  const author = take ? selectAuthor(state, take.authorId) : undefined;

  if (!take || !author) {
    return (
      <View style={[styles.root, styles.missing, { paddingTop: insets.top + space.md }]}>
        <Text style={styles.missingTitle}>This take is no longer live.</Text>
        <Pressable onPress={() => router.back()} style={styles.backButton} accessibilityRole="button">
          <BackIcon size={18} color={ink.primary} />
          <Text style={styles.backText}>Back to Arena</Text>
        </Pressable>
      </View>
    );
  }

  const openClash = (): void => {
    hapticPress();
    router.push(`/clash/${take.id}`);
  };

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.xxxl },
        ]}
      >
        <View style={styles.topRow}>
          <Pressable
            onPress={() => router.back()}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Back to Arena"
          >
            <BackIcon size={18} color={ink.primary} />
          </Pressable>
          <Text style={styles.eyebrow}>TAKE</Text>
          <View style={styles.topSlot} />
        </View>

        <View style={styles.authorRow}>
          <Avatar name={author.name} tint={author.tint} size={40} />
          <View style={styles.authorText}>
            <Text style={styles.handle}>@{author.handle}</Text>
            <Text style={styles.meta}>{HOOD_LABEL[take.hood]}</Text>
          </View>
        </View>

        <Text style={styles.takeText}>{take.text}</Text>
        {take.media ? <TakeMedia media={take.media} /> : null}

        <View style={styles.statsRow}>
          <Text style={styles.stats}>{compact(take.clashes)} clashes</Text>
          <Text style={styles.dot}>·</Text>
          <Text style={styles.stats}>{timeLeftLabel(take.expiresAt, now)} left</Text>
        </View>

        <Pressable
          onPress={openClash}
          style={styles.clashButton}
          accessibilityRole="button"
          accessibilityLabel="Clash on this take"
        >
          <ZapIcon size={18} color={duel.a} strokeWidth={2.6} />
          <Text style={styles.clashText}>CLASH</Text>
          <ZapIcon size={18} color={duel.b} strokeWidth={2.6} />
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  content: { paddingHorizontal: space.md, gap: space.lg },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topSlot: { width: 44, height: 44 },
  backButton: {
    minWidth: 44,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  backText: { ...typeScale.meta, color: ink.primary },
  eyebrow: { ...typeScale.caption, color: ink.tertiary, letterSpacing: 2.4 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  authorText: { flex: 1, gap: space.xxs },
  handle: { ...typeScale.bodyStrong, color: ink.primary },
  meta: { ...typeScale.meta, color: ink.secondary },
  takeText: { ...typeScale.takeText, color: ink.primary },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  stats: { ...typeScale.meta, color: ink.secondary },
  dot: { ...typeScale.meta, color: ink.quaternary },
  clashButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    borderRadius: radius.sm,
    backgroundColor: action.darkFill,
    borderWidth: 1,
    borderColor: duel.aLine,
  },
  clashText: { ...typeScale.button, color: action.darkText, letterSpacing: 1.6 },
  missing: { paddingHorizontal: space.lg },
  missingTitle: { ...typeScale.title, color: ink.primary, textAlign: 'center' },
});