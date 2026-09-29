import React from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../store/AuthProvider';
import { useNotificationUnread } from '../../store/NotificationUnreadProvider';
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from '../../services/notificationService';
import { fetchProfilesByIds } from '../../services/apiService';
import { fetchClashById } from '../../services/clashEngineService';
import { NotificationRow } from '../../components/notifications/NotificationRow';
import { EmptyState } from '../../components/shared/EmptyState';
import { BellIcon } from '../../components/shared/icons';
import type { User } from '../../store';
import { color, ink, layout, space, typeScale } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';

/** Activity inbox — real `notifications` rows, actor avatars, read state. */
export default function NotificationsTab(): React.JSX.Element {
  const { signedIn, loading } = useAuth();
  const { refresh: refreshUnread } = useNotificationUnread();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [items, setItems] = React.useState<AppNotification[] | null>(null);
  const [actors, setActors] = React.useState<Map<string, User>>(new Map());
  const [refreshing, setRefreshing] = React.useState(false);

  const load = React.useCallback(async (): Promise<void> => {
    const rows = await fetchNotifications();
    setItems(rows);
    void refreshUnread();
    const ids = [...new Set(rows.map((row) => row.actorId).filter((id): id is string => id !== null))];
    if (ids.length > 0) {
      const users = await fetchProfilesByIds(ids);
      setActors(new Map(users.map((user) => [user.id, user])));
    } else {
      setActors(new Map());
    }
  }, [refreshUnread]);

  useFocusEffect(
    React.useCallback(() => {
      if (!signedIn) return;
      void load();
    }, [signedIn, load]),
  );

  const open = async (item: AppNotification): Promise<void> => {
    if (item.readAt === null) {
      setItems((prev) => prev?.map((row) => (row.id === item.id ? { ...row, readAt: Date.now() } : row)) ?? prev);
      void markNotificationRead(item.id).catch(() => undefined);
    }

    switch (item.kind) {
      case 'new_follower':
        if (item.actorId) router.push(`/profile/${item.actorId}`);
        break;
      case 'comment':
      case 'reply':
        if (item.entityId) router.push(`/take/${item.entityId}`);
        break;
      case 'clash_started':
      case 'clash_result':
      case 'reputation': {
        if (item.entityId) {
          try {
            const clash = await fetchClashById(item.entityId);
            router.push(clash ? `/clash/${clash.takeId}` : '/(tabs)/profile');
          } catch {
            router.push('/(tabs)/profile');
          }
        } else {
          router.push('/(tabs)/profile');
        }
        break;
      }
      default:
        break;
    }
  };

  const markAll = async (): Promise<void> => {
    setItems((prev) => prev?.map((row) => (row.readAt === null ? { ...row, readAt: Date.now() } : row)) ?? prev);
    try {
      await markAllNotificationsRead();
      void refreshUnread();
    } catch {
      // Server read-state will reconcile on the next focus fetch.
    }
  };

  const unreadCount = (items ?? []).filter((item) => item.readAt === null).length;

  if (loading) return <View style={styles.screen} />;

  if (!signedIn) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <EmptyState
          icon={BellIcon}
          title="Your activity"
          body="Sign in to see replies, Clash results and reputation."
          actionLabel="Sign in"
          onAction={() => router.push('/auth')}
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={items ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <NotificationRow
            notification={item}
            actor={actors.get(item.actorId ?? '')}
            onPress={() => void open(item)}
          />
        )}
        ListHeaderComponent={<Header unreadCount={unreadCount} onMarkAll={() => void markAll()} />}
        ListEmptyComponent={
          items === null ? (
            <View style={styles.spinner}>
              <ActivityIndicator color="#FFFFFF" />
            </View>
          ) : (
            <EmptyState
              icon={BellIcon}
              title="No notifications yet"
              body="When you get replies, Clash results or followers, you'll see them here."
            />
          )
        }
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xxl },
        ]}
        refreshing={refreshing}
        onRefresh={() => {
          setRefreshing(true);
          void load().finally(() => setRefreshing(false));
        }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

function Header({ unreadCount, onMarkAll }: { unreadCount: number; onMarkAll: () => void }): React.JSX.Element {
  return (
    <View style={styles.header}>
      <View style={styles.headerTop}>
        <View>
          <Text allowFontScaling={false} style={styles.eyebrow}>
            ACTIVITY
          </Text>
          <Text allowFontScaling={false} style={styles.title}>
            Notifications
          </Text>
        </View>
        {unreadCount > 0 ? (
          <Pressable
            onPress={() => {
              hapticTap();
              onMarkAll();
            }}
            accessibilityRole="button"
            accessibilityLabel={`Mark all ${unreadCount} notifications as read`}
            style={styles.markAll}
          >
            <Text allowFontScaling={false} style={styles.markAllText}>
              Mark all read
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  content: { paddingHorizontal: layout.screenX },
  header: { paddingBottom: space.sm },
  headerTop: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  eyebrow: { ...typeScale.caption, fontSize: 10, letterSpacing: 1.4, color: ink.quaternary },
  title: { ...typeScale.title, fontSize: 26, color: ink.primary },
  markAll: { paddingVertical: space.xs, paddingHorizontal: space.sm },
  markAllText: { ...typeScale.meta, color: ink.secondary },
  spinner: { paddingVertical: space.xxl, alignItems: 'center' },
});
