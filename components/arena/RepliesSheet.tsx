import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassCard } from '../shared/GlassCard';
import { IconButton } from '../shared/IconButton';
import { CloseIcon } from '../shared/icons';
import { color, duration, ink, radius, space, typeScale } from '../../theme';
import { CommentList } from './CommentList';
import { RebuttalInput } from './RebuttalInput';

export interface RepliesSheetProps {
  takeId: string | null;
  onClose: () => void;
}

export type RepliesSort = 'top' | 'recent';

/** Bottom sheet listing every rebuttal for a take. Isolated — no TakeCard edits. */
export function RepliesSheet({ takeId, onClose }: RepliesSheetProps): React.JSX.Element | null {
  const insets = useSafeAreaInsets();
  const [sort, setSort] = React.useState<RepliesSort>('top');

  React.useEffect(() => {
    if (takeId) setSort('top');
  }, [takeId]);

  if (!takeId) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(duration.fast)} style={styles.scrim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close replies" />
        <Animated.View entering={FadeInUp.duration(duration.base)} style={[styles.box, { paddingBottom: insets.bottom + space.lg }]}>
          <GlassCard level="strong" corner={radius.xxl} contentStyle={styles.card}>
            <View style={styles.head}>
              <Text allowFontScaling={false} style={styles.title}>Challengers</Text>
              <IconButton icon={CloseIcon} onPress={onClose} label="Close challengers" size={32} />
            </View>
            <SortSeg sort={sort} onChange={setSort} />
            <CommentList takeId={takeId} sort={sort} />
            <RebuttalInput takeId={takeId} />
          </GlassCard>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

function SortSeg({ sort, onChange }: { sort: RepliesSort; onChange: (s: RepliesSort) => void }): React.JSX.Element {
  return (
    <View style={styles.seg}>
      {(['top', 'recent'] as const).map((mode) => (
        <Pressable
          key={mode}
          onPress={() => onChange(mode)}
          accessibilityRole="tab"
          accessibilityState={{ selected: sort === mode }}
          style={[styles.segBtn, sort === mode && styles.segOn]}
        >
          <Text allowFontScaling={false} style={[styles.segText, sort === mode && styles.segTextOn]}>
            {mode === 'top' ? 'Top' : 'Recent'}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: color.scrim },
  box: { padding: space.lg },
  card: { gap: space.md, maxHeight: 560 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...typeScale.cardTitle, color: ink.primary },
  seg: { flexDirection: 'row', gap: 8 },
  segBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  segOn: { backgroundColor: ink.primary, borderColor: ink.primary },
  segText: { ...typeScale.caption, fontSize: 11, color: ink.secondary },
  segTextOn: { color: ink.inverse },
});
