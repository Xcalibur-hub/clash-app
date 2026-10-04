import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, space, typeScale, useThemeColors } from '../../../theme';
import { tap as hapticTap } from '../../../utils/haptics';

export type CommunityActionKind = 'report' | 'delete' | 'hide' | 'unhide' | 'block';

export interface CommunityAction {
  kind: CommunityActionKind;
  label: string;
  destructive?: boolean;
}

export interface CommunityActionSheetProps {
  visible: boolean;
  title: string;
  actions: readonly CommunityAction[];
  onAction: (kind: CommunityActionKind) => void;
  onClose: () => void;
}

/**
 * One small moderation/options sheet shared by posts and replies. It only ever
 * offers actions the server payload already permitted (`canDelete` /
 * `canModerate`); the RPCs re-check regardless.
 */
export function CommunityActionSheet({
  visible,
  title,
  actions,
  onAction,
  onClose,
}: CommunityActionSheetProps): React.JSX.Element {
  const t = useThemeColors();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close options">
        <Animated.View entering={FadeIn.duration(120)} style={StyleSheet.absoluteFill}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} />
        </Animated.View>
        <Animated.View entering={FadeInUp.duration(180)} style={[styles.sheet, { paddingBottom: insets.bottom + space.md }]}>
          <View style={[styles.card, { backgroundColor: t.surfaceElevated, borderColor: t.border }]}>
            <Text allowFontScaling={false} style={[styles.title, { color: t.textMuted }]} numberOfLines={2}>
              {title}
            </Text>
            {actions.map((action) => (
              <Pressable
                key={action.kind}
                onPress={() => {
                  hapticTap();
                  onAction(action.kind);
                }}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                style={[styles.row, { borderColor: t.border }]}
              >
                <Text
                  allowFontScaling={false}
                  style={[styles.rowLabel, { color: action.destructive ? t.danger : t.textPrimary }]}
                >
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end' },
  sheet: { paddingHorizontal: space.md },
  card: { borderRadius: radius.xxl, borderWidth: StyleSheet.hairlineWidth, paddingVertical: space.xs },
  title: { ...typeScale.caption, paddingHorizontal: space.md, paddingVertical: space.sm, fontWeight: '700', letterSpacing: 0.4 },
  row: { paddingHorizontal: space.md, paddingVertical: space.md, borderTopWidth: StyleSheet.hairlineWidth },
  rowLabel: { ...typeScale.body, fontWeight: '600' },
});
