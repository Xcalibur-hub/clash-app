import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { layout, radius, space, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';
import { ImageIcon, VideoIcon } from '../shared/icons';

export interface MediaAttachRowProps {
  onPick: (kind: 'image' | 'video') => void;
}

const ITEMS = [
  { kind: 'image', label: 'Add image', icon: ImageIcon },
  { kind: 'video', label: 'Add video', icon: VideoIcon },
] as const;

/** Attachment buttons for a new Take. */
export function MediaAttachRow({ onPick }: MediaAttachRowProps): React.JSX.Element {
  const t = useThemeColors();
  return (
    <View style={styles.row}>
      {ITEMS.map(({ kind, label, icon: Icon }) => (
        <Pressable
          key={kind}
          onPress={() => {
            hapticTap();
            onPick(kind);
          }}
          accessibilityRole="button"
          accessibilityLabel={label}
          style={[
            styles.button,
            {
              borderColor: t.border,
              backgroundColor: t.surfaceMuted,
            },
          ]}
        >
          <Icon size={16} color={t.textSecondary} strokeWidth={2.4} />
          <Text allowFontScaling={false} style={[styles.label, { color: t.textSecondary }]}>
            {label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    height: layout.hit - 4,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: { ...typeScale.label },
});
