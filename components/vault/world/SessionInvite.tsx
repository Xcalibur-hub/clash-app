import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { space, typeScale, useThemeColors } from '../../../theme';
import { tap as hapticTap } from '../../../utils/haptics';
import { EditorialMedia } from './EditorialMedia';

export interface SessionItem {
  id: string;
  title: string;
  subtitle?: string | null;
  mediaUrl?: string | null;
  tint?: string | null;
  meta?: string | null;
}

export interface SessionInviteProps {
  items: readonly SessionItem[];
  creatorName: string;
  radius?: number;
  onOpen: (id: string) => void;
}

/**
 * Access to the creator — large portrait + editorial type + REQUEST.
 * Not a marketplace listing; no inventory card chrome.
 */
export const SessionInvite = React.memo(function SessionInvite({
  items,
  creatorName,
  radius = 4,
  onOpen,
}: SessionInviteProps): React.JSX.Element {
  const t = useThemeColors();
  const first = creatorName.trim().split(' ')[0] || creatorName;

  return (
    <View style={styles.wrap}>
      {items.map((item) => (
        <Pressable
          key={item.id}
          onPress={() => {
            hapticTap();
            onOpen(item.id);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Request session: ${item.title}`}
          style={styles.invite}
        >
          <EditorialMedia
            mediaUrl={item.mediaUrl}
            accent={item.tint}
            height={168}
            width={128}
            radius={radius}
            onPress={() => onOpen(item.id)}
          />
          <View style={styles.body}>
            <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
              {`WORK WITH ${first.toUpperCase()}`}
            </Text>
            <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]} numberOfLines={3}>
              {item.title}
            </Text>
            {item.subtitle ? (
              <Text allowFontScaling={false} style={[styles.sub, { color: t.textSecondary }]} numberOfLines={2}>
                {item.subtitle}
              </Text>
            ) : null}
            <View style={styles.footer}>
              {item.meta ? (
                <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]} numberOfLines={1}>
                  {item.meta}
                </Text>
              ) : (
                <View />
              )}
              <Text allowFontScaling={false} style={[styles.cta, { color: t.textPrimary }]}>
                REQUEST SESSION →
              </Text>
            </View>
          </View>
        </Pressable>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: space.xl },
  invite: {
    flexDirection: 'row',
    gap: space.md,
    alignItems: 'stretch',
  },
  body: {
    flex: 1,
    gap: 4,
    justifyContent: 'center',
    paddingVertical: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(127,127,127,0.28)',
    paddingBottom: space.md,
  },
  kicker: { ...typeScale.caption, fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  title: {
    ...typeScale.display,
    fontSize: 26,
    lineHeight: 28,
    fontWeight: '800',
    letterSpacing: -0.7,
  },
  sub: { ...typeScale.meta, fontSize: 13, lineHeight: 18 },
  footer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: space.sm,
    marginTop: space.sm,
  },
  meta: { ...typeScale.caption, letterSpacing: 0.3, flexShrink: 1 },
  cta: { ...typeScale.caption, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
});
