import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';

export type ExpressiveReplyMode = 'meme' | 'gif' | 'sticker';

export interface MessageExpressiveSheetProps {
  visible: boolean;
  onClose: () => void;
  onReply: () => void;
  onExpressive: (mode: ExpressiveReplyMode) => void;
  onReport?: () => void;
}

export function MessageExpressiveSheet({
  visible,
  onClose,
  onReply,
  onExpressive,
  onReport,
}: MessageExpressiveSheetProps): React.JSX.Element {
  const t = useThemeColors();
  const insets = useSafeAreaInsets();

  const pick = (mode: ExpressiveReplyMode): void => {
    hapticTap();
    onClose();
    onExpressive(mode);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Dismiss" />
      <View style={[styles.sheet, { backgroundColor: t.surfaceElevated, paddingBottom: insets.bottom + space.md }]}>
        <Action label="Reply" onPress={() => { hapticTap(); onClose(); onReply(); }} />
        <Action label="Meme" hint="Image or trending" onPress={() => pick('meme')} />
        <Action label="GIF" onPress={() => pick('gif')} />
        <Action label="Sticker" onPress={() => pick('sticker')} />
        {onReport ? (
          <Action label="Report" destructive onPress={() => { hapticTap(); onClose(); onReport(); }} />
        ) : null}
      </View>
    </Modal>
  );
}

function Action({
  label,
  hint,
  destructive,
  onPress,
}: {
  label: string;
  hint?: string;
  destructive?: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const t = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.action, { borderBottomColor: t.border }]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text
        allowFontScaling={false}
        style={[styles.actionText, { color: destructive ? t.danger : t.textPrimary }]}
      >
        {label}
      </Text>
      {hint ? (
        <Text allowFontScaling={false} style={[styles.hint, { color: t.textMuted }]}>
          {hint}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    position: 'absolute',
    left: space.md,
    right: space.md,
    bottom: 0,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  action: {
    paddingVertical: 16,
    paddingHorizontal: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  actionText: { ...typeScale.body, fontSize: 17, fontWeight: '600' },
  hint: { ...typeScale.caption, fontSize: 12 },
});
