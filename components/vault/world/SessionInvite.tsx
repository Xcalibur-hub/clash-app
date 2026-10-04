import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { space, typeScale, useThemeColors } from '../../../theme';
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
 * Services as access to the creator: a square portrait plane beside strong
 * typography and a REQUEST affordance — never inventory listings.
 */
export const SessionInvite = React.memo(function SessionInvite({
  items,
  creatorName,
  radius = 8,
  onOpen,
}: SessionInviteProps): React.JSX.Element {
  const t = useThemeColors();
  const first = creatorName.trim().split(' ')[0] || creatorName;

  return (
    <View style={styles.wrap}>
      {items.map((item, index) => (
        <View key={item.id} style={[styles.invite, { borderColor: t.border }]}>
          <EditorialMedia
            mediaUrl={item.mediaUrl}
            accent={item.tint}
            height={112}
            width={96}
            radius={radius}
            hairline
            badge={String(index + 1).padStart(2, '0')}
            onPress={() => onOpen(item.id)}
          />
          <View style={styles.body}>
            <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
              {`WITH ${first.toUpperCase()}`}
            </Text>
            <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]} numberOfLines={2}>
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
              ) : null}
              <Text allowFontScaling={false} style={[styles.cta, { color: t.textPrimary }]}>
                REQUEST →
              </Text>
            </View>
          </View>
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: space.lg },
  invite: {
    flexDirection: 'row',
    gap: space.md,
    paddingBottom: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  body: { flex: 1, gap: 3 },
  kicker: { ...typeScale.caption, fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  title: { ...typeScale.title, fontSize: 22, lineHeight: 25, fontWeight: '800', letterSpacing: -0.5 },
  sub: { ...typeScale.meta, fontSize: 13, lineHeight: 18 },
  footer: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.sm, marginTop: space.xs },
  meta: { ...typeScale.caption, letterSpacing: 0.3, flexShrink: 1 },
  cta: { ...typeScale.caption, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
});
