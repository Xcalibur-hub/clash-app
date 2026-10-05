/**
 * Room Pulse — animated constellation of real category leaders.
 * Not a dashboard. Categories omitted when empty.
 */
import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import type { ArenaPulseLeader, ArenaRoomPulse } from '../../services/liveArenaService';
import { layout, radius, space, typeScale, useThemeColors } from '../../theme';
import { pulseAccessibilitySummary } from '../../utils/roomPulseScore';
import { tap as hapticTap } from '../../utils/haptics';
import { Avatar } from '../shared/Avatar';
import { softFill } from './liveArenaStyles';

export interface RoomPulseSheetProps {
  visible: boolean;
  pulse: ArenaRoomPulse | null;
  loading?: boolean;
  roomIndex?: number | null;
  onClose: () => void;
}

const NODE_POS: Record<string, { top: number; left: number }> = {
  TOP_ARGUMENT: { top: 88, left: 24 },
  BEST_EVIDENCE: { top: 28, left: 160 },
  BEST_REBUTTAL: { top: 150, left: 180 },
  FAST_RISING: { top: 200, left: 56 },
  CROWD_FAVORITE: { top: 120, left: 110 },
};

export function RoomPulseSheet({
  visible,
  pulse,
  loading = false,
  roomIndex = null,
  onClose,
}: RoomPulseSheetProps): React.JSX.Element {
  const t = useThemeColors();
  const leaders = pulse?.leaders ?? [];
  const settled = pulse?.status === 'SETTLED';
  const a11y = pulseAccessibilitySummary(
    leaders.map((l) => ({
      category: l.category,
      label: l.label,
      messageId: l.messageId,
      evidenceId: l.evidenceId,
      authorId: l.author?.id ?? '',
      authorHandle: l.author?.handle ?? '',
      authorName: l.author?.name ?? 'Someone',
      authorTint: l.author?.avatarTint ?? '#A1A1AA',
      score: l.score,
      preview: l.preview,
    })),
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button">
        <Pressable
          style={[styles.sheet, { backgroundColor: t.surfaceElevated, borderColor: t.border }]}
          onPress={() => undefined}
          accessibilityViewIsModal
          accessibilityLabel={a11y}
        >
          <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
            {settled
              ? roomIndex != null
                ? `Room ${roomIndex} — Final Pulse`
                : 'Final Pulse'
              : 'Room Pulse'}
          </Text>
          <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
            {settled ? 'How this battle landed' : 'What is happening in this battle'}
          </Text>

          {loading && leaders.length === 0 ? (
            <ActivityIndicator color={t.textPrimary} style={{ marginVertical: space.xl }} />
          ) : leaders.length === 0 ? (
            <Text allowFontScaling={false} style={[styles.empty, { color: t.textMuted }]}>
              No qualifying candidates yet. Keep debating.
            </Text>
          ) : (
            <View style={styles.map} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {leaders.map((leader) => (
                <PulseNode key={leader.category} leader={leader} />
              ))}
            </View>
          )}

          <View style={styles.list}>
            {leaders.map((leader) => (
              <View key={`row-${leader.category}`} style={styles.row}>
                <Text allowFontScaling={false} style={[styles.cat, { color: t.textMuted }]}>
                  {leader.label}
                </Text>
                <Text allowFontScaling={false} style={[styles.who, { color: t.textPrimary }]}>
                  {leader.author?.name ?? 'Someone'}
                </Text>
              </View>
            ))}
          </View>

          <Pressable
            onPress={() => {
              hapticTap();
              onClose();
            }}
            style={[styles.close, { borderColor: t.borderStrong }]}
            accessibilityRole="button"
            accessibilityLabel="Close Room Pulse"
          >
            <Text allowFontScaling={false} style={[styles.closeText, { color: t.textPrimary }]}>
              Close
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function PulseNode({ leader }: { leader: ArenaPulseLeader }): React.JSX.Element {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const drift = useSharedValue(0);
  const pos = NODE_POS[leader.category] ?? { top: 100, left: 100 };

  React.useEffect(() => {
    if (reduced) return;
    drift.value = withRepeat(withTiming(1, { duration: 3200 }), -1, true);
  }, [drift, reduced]);

  const anim = useAnimatedStyle(() => ({
    transform: [
      { translateY: reduced ? 0 : (drift.value - 0.5) * 6 },
      {
        scale: withSpring(1, { damping: 16, stiffness: 180 }),
      },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.node,
        anim,
        {
          top: pos.top,
          left: pos.left,
          backgroundColor: softFill(t),
          borderColor: t.borderStrong,
        },
      ]}
    >
      <Text allowFontScaling={false} style={[styles.nodeCat, { color: t.textMuted }]}>
        {leader.category === 'FAST_RISING' ? '⚡ ' : ''}
        {leader.label}
      </Text>
      <Avatar
        name={leader.author?.name ?? 'Someone'}
        tint={leader.author?.avatarTint ?? '#A1A1AA'}
        size={34}
      />
      <Text allowFontScaling={false} style={[styles.nodeName, { color: t.textPrimary }]} numberOfLines={1}>
        {leader.author?.name ?? 'Someone'}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(8,8,11,0.52)',
    justifyContent: 'flex-end',
    padding: layout.screenX,
    paddingBottom: space.xxl,
  },
  sheet: {
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
    gap: space.sm,
    maxHeight: '88%',
  },
  kicker: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  title: { ...typeScale.section, fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  empty: { ...typeScale.meta, fontSize: 14, textAlign: 'center', marginVertical: space.xl },
  map: {
    height: 260,
    marginVertical: space.sm,
    borderRadius: 20,
    overflow: 'hidden',
  },
  node: {
    position: 'absolute',
    width: 108,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  nodeCat: {
    ...typeScale.caption,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  nodeName: { ...typeScale.caption, fontSize: 12, fontWeight: '800' },
  list: { gap: 6, marginTop: space.xs },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  cat: { ...typeScale.caption, fontSize: 12, fontWeight: '700' },
  who: { ...typeScale.label, fontSize: 13, fontWeight: '800', flexShrink: 1, textAlign: 'right' },
  close: {
    marginTop: space.sm,
    minHeight: 44,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { ...typeScale.label, fontSize: 14, fontWeight: '800' },
});
