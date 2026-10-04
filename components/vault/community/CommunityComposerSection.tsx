import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { space, typeScale, useThemeColors } from '../../../theme';
import { tap as hapticTap } from '../../../utils/haptics';
import { CommunityComposer } from './CommunityComposer';

export interface CommunityComposerSectionProps {
  canAnnounce: boolean;
  pseudonymous: boolean;
  pseudonym: string | null;
  realName: string;
  composeType: 'discussion' | 'announcement';
  onChangeComposeType: (type: 'discussion' | 'announcement') => void;
  busy: boolean;
  onSubmit: (input: { body: string; pseudonymous: boolean }) => void;
}

/** The feed's composer row: optional post-type toggle plus the composer. */
export function CommunityComposerSection({
  canAnnounce,
  pseudonymous,
  pseudonym,
  realName,
  composeType,
  onChangeComposeType,
  busy,
  onSubmit,
}: CommunityComposerSectionProps): React.JSX.Element {
  return (
    <View style={styles.wrap}>
      {canAnnounce ? (
        <View style={styles.typeRow}>
          <TypePill
            label="Discussion"
            active={composeType === 'discussion'}
            onPress={() => onChangeComposeType('discussion')}
          />
          <TypePill
            label="Announcement"
            active={composeType === 'announcement'}
            onPress={() => onChangeComposeType('announcement')}
          />
        </View>
      ) : null}
      <CommunityComposer
        realName={realName}
        pseudonymEnabled={pseudonymous && composeType === 'discussion'}
        pseudonym={pseudonym}
        busy={busy}
        onSubmit={onSubmit}
      />
    </View>
  );
}

function TypePill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const t = useThemeColors();
  return (
    <Text
      onPress={() => {
        hapticTap();
        onPress();
      }}
      allowFontScaling={false}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        styles.typePill,
        { color: active ? t.textPrimary : t.textMuted, borderColor: active ? t.textPrimary : t.border },
      ]}
    >
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  typeRow: { flexDirection: 'row', gap: space.sm },
  typePill: {
    ...typeScale.caption,
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: space.sm,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
