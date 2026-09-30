import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { User } from '../../store';
import type { AppNotification } from '../../services/notificationService';
import { space, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';
import { timeAgo } from '../../utils/format';
import { Avatar } from '../shared/Avatar';
import { BellIcon } from '../shared/icons';

export interface NotificationRowProps {
  notification: AppNotification;
  actor: User | undefined;
  onPress: () => void;
}

function describe(notification: AppNotification, actor: User | undefined): { title: string; subtitle?: string } {
  const who = actor ? `@${actor.handle}` : 'Someone';
  switch (notification.kind) {
    case 'new_follower':
      return { title: `${who} followed you` };
    case 'comment':
      return { title: `${who} replied to your Take` };
    case 'reply':
      return { title: `${who} replied to your rebuttal` };
    case 'clash_started':
      return { title: `${who} started a Clash on your Take` };
    case 'clash_result':
      return { title: 'Your Clash has a result', subtitle: 'Tap to see the verdict' };
    case 'reputation':
      return { title: 'You earned reputation from a Clash', subtitle: 'Tap to see the Clash' };
    case 'hall_of_fame':
      return { title: 'Your Take entered the Hall of Fame' };
    case 'vault_subscription':
      return { title: 'Vault subscription update' };
    case 'sponsor_activity':
      return { title: 'Sponsor activity' };
    default:
      return { title: 'New activity' };
  }
}

/** One activity row: actor avatar, action text, relative time, read state. */
export function NotificationRow({ notification, actor, onPress }: NotificationRowProps): React.JSX.Element {
  const t = useThemeColors();
  const unread = notification.readAt === null;
  const { title, subtitle } = describe(notification, actor);

  return (
    <Pressable
      onPress={() => {
        hapticTap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${unread ? 'Unread. ' : ''}${title}`}
      style={[styles.row, { borderBottomColor: t.border }]}
    >
      {actor ? (
        <Avatar name={actor.name} tint={actor.tint} size={40} />
      ) : (
        <View
          style={[
            styles.systemBadge,
            { backgroundColor: t.surfaceMuted, borderColor: t.border },
          ]}
        >
          <BellIcon size={18} color={t.textSecondary} strokeWidth={2.2} />
        </View>
      )}
      <View style={styles.body}>
        <Text
          allowFontScaling={false}
          style={[styles.title, { color: unread ? t.textPrimary : t.textMuted }, unread && styles.titleUnread]}
          numberOfLines={2}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text allowFontScaling={false} style={[styles.subtitle, { color: t.textMuted }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        <Text allowFontScaling={false} style={[styles.time, { color: t.textMuted }]}>
          {timeAgo(notification.createdAt)}
        </Text>
      </View>
      {unread ? (
        <View style={[styles.dot, { backgroundColor: t.textPrimary }]} accessibilityLabel="Unread" accessible />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  systemBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  body: { flex: 1, gap: 1 },
  title: { ...typeScale.body },
  titleUnread: { fontWeight: '600' },
  subtitle: { ...typeScale.meta },
  time: { ...typeScale.meta, fontSize: 12 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: space.sm,
  },
});
