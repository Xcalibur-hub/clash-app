import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { glassBorder, glassFill, ink, layout, radius, space, typeScale } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';
import { ImageIcon, VideoIcon } from '../shared/icons';

export interface MediaAttachRowProps {
  onPick: (kind: 'image' | 'video') => void;
}

const ITEMS = [
  { kind: 'image', label: 'Add image', icon: ImageIcon },
  { kind: 'video', label: 'Add video', icon: VideoIcon },
] as const;

/** Glass attachment buttons for a new Take (reference screen 11). */
export function MediaAttachRow({ onPick }: MediaAttachRowProps): React.JSX.Element {
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
          style={styles.button}
        >
          <Icon size={16} color={ink.secondary} strokeWidth={2.4} />
          <Text allowFontScaling={false} style={styles.label}>
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
    borderWidth: 1,
    borderColor: glassBorder.regular,
    backgroundColor: glassFill.soft,
  },
  label: { ...typeScale.label, color: ink.secondary },
});