import React from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../store/AuthProvider';
import { useNotificationUnread } from '../../store/NotificationUnreadProvider';
import { fetchNotifications, markAllNotificationsRead, markNotificationRead, type AppNotification } from '../../services/notificationService';
import { fetchProfilesByIds } from '../../services/apiService';
import { currentUserId } from '../../services/supabaseClient';
import { fetchRoom } from '../../services/liveArenaService';
import { resolveArenaReturn } from '../../services/arenaReturnVisitService';
import { ArenaReturnVisits } from '../../components/arena/ArenaReturnVisits';
import { ArenaButton } from '../../components/arena/ui/ArenaPrimitives';
import { NotificationRow } from '../../components/notifications/NotificationRow';
import { EmptyState } from '../../components/shared/EmptyState';
import { BellIcon } from '../../components/shared/icons';
import type { User } from '../../store';
import { layout, space, typeScale, useThemeColors } from '../../theme';
import { dockBottomPadding } from '../../components/navigation/dockConfig';
import { tap as hapticTap } from '../../utils/haptics';

/** Existing recipient-owned inbox; no new events, subscriptions or notification writers. */
export default function NotificationsTab(): React.JSX.Element {
  const { signedIn, loading, user } = useAuth(), owner = user?.id ?? null;
  const { refresh: refreshUnread } = useNotificationUnread(), router = useRouter(), insets = useSafeAreaInsets(), t = useThemeColors();
  const [snapshot,setSnapshot] = React.useState<{owner:string;items:AppNotification[];actors:Map<string,User>;error:boolean}|null>(null);
  const [refreshing,setRefreshing] = React.useState(false),[retry,setRetry] = React.useState(0),[notice,setNotice] = React.useState('');
  const generation = React.useRef(0), opening = React.useRef(false), marking = React.useRef(false);
  useFocusEffect(React.useCallback(() => {
    let active = true;
    const request = ++generation.current;
    setSnapshot(null);setNotice('');opening.current=false;marking.current=false;
    if (owner) void (async()=>{
      try {
        const items = await fetchNotifications();
        if (!active || request!==generation.current || await currentUserId()!==owner) return;
        const ids = [...new Set(items.flatMap(row=>row.actorId?[row.actorId]:[]))];
        let actors = new Map<string,User>();
        try { if (ids.length) actors=new Map((await fetchProfilesByIds(ids)).map(actor=>[actor.id,actor])); } catch { /* Notification text remains available without actor enrichment. */ }
        if (active && request===generation.current && await currentUserId()===owner) {setSnapshot({owner,items,actors,error:false});void refreshUnread();}
      } catch { if (active && request===generation.current) setSnapshot({owner,items:[],actors:new Map(),error:true}); }
      finally {if(active && request===generation.current)setRefreshing(false);}
    })();
    return()=>{active=false;generation.current++;};
  },[owner,retry,refreshUnread]));
  const current = snapshot?.owner===owner?snapshot:null;
  const items = current?.items??[], actors = current?.actors??new Map<string,User>();
  const currentRequest = async(request:number):Promise<boolean> => !!owner && request===generation.current && await currentUserId()===owner;
  const open = async(item:AppNotification):Promise<void>=>{
    if(!owner||opening.current)return;
    opening.current=true;const request=generation.current;setNotice('');
    try {
      if(!await currentRequest(request))return;
      let destination:Parameters<typeof router.push>[0]|null=null;
      switch(item.kind){
        case 'challenge_received':case 'comment':case 'reply': if(item.entityId)destination=`/take/${item.entityId}`;break;
        case 'challenge_accepted': if(item.entityId){const room=await fetchRoom(item.entityId);if(!room.clashId)throw Error('Unavailable');const resolved=await resolveArenaReturn(owner,room.clashId,()=>request===generation.current);destination=resolved.destination;}break;
        case 'new_follower':if(item.actorId)destination=`/profile/${item.actorId}`;break;
        case 'clash_started':case 'clash_result':case 'reputation':if(item.entityId){const resolved=await resolveArenaReturn(owner,item.entityId,()=>request===generation.current);destination=resolved.destination;}break;
      }
      if(!await currentRequest(request))return;
      if(!destination){setNotice('This activity is unavailable or access has changed.');return;}
      if(item.readAt===null){
        try {await markNotificationRead(item.id);if(await currentRequest(request)){setSnapshot(previous=>previous?.owner===owner?{...previous,items:previous.items.map(row=>row.id===item.id?{...row,readAt:Date.now()}:row)}:previous);void refreshUnread();}}
        catch {if(await currentRequest(request))setNotice('Read state could not be saved. It will refresh next visit.');}
      }
      if(await currentRequest(request))router.push(destination);
    }catch{if(await currentRequest(request))setNotice('Couldn’t verify this activity. No navigation occurred.');}
    finally{if(request===generation.current)opening.current=false;}
  };
  const markAll=async():Promise<void>=>{
    if(!owner||marking.current)return;marking.current=true;const request=generation.current;
    try{if(!await currentRequest(request))return;await markAllNotificationsRead();if(await currentRequest(request)){setSnapshot(previous=>previous?.owner===owner?{...previous,items:previous.items.map(row=>row.readAt===null?{...row,readAt:Date.now()}:row)}:previous);void refreshUnread();}}
    catch{if(await currentRequest(request))setNotice('Couldn’t mark notifications read. Try again.');}
    finally{if(request===generation.current)marking.current=false;}
  };
  const bottomPad=dockBottomPadding(insets.bottom);
  if(loading)return <View style={[styles.screen,{backgroundColor:t.background}]} />;
  if(!signedIn||!owner)return <View style={[styles.screen,{backgroundColor:t.background,paddingTop:insets.top,paddingBottom:bottomPad}]}><EmptyState icon={BellIcon} title="Your activity" body="Sign in to see replies and your recent Clashes." actionLabel="Sign in" onAction={()=>router.push('/auth')} /></View>;
  return <View style={[styles.screen,{backgroundColor:t.background,paddingTop:insets.top}]}><FlatList data={items} keyExtractor={item=>item.id}
    renderItem={({item})=><NotificationRow notification={item} actor={actors.get(item.actorId??'')} onPress={()=>void open(item)} />}
    ListHeaderComponent={<View><ArenaReturnVisits refreshToken={retry}/><Header unreadCount={items.filter(item=>item.readAt===null).length} onMarkAll={()=>void markAll()}/>{notice?<Text accessibilityRole="alert" style={{color:t.textSecondary,paddingVertical:12}}>{notice}</Text>:null}</View>}
    ListEmptyComponent={!current?<View style={styles.spinner}><ActivityIndicator color={t.textPrimary}/></View>:current.error?<View style={{gap:8}}><Text accessibilityRole="alert" style={{color:t.textSecondary}}>Couldn’t load notifications. These are not empty results.</Text><ArenaButton label="Retry notifications" onPress={()=>setRetry(n=>n+1)}/></View>:<EmptyState icon={BellIcon} title="No notifications in this window" body="The latest 50 recipient-owned notifications appear here. This is not complete activity history."/>}
    contentContainerStyle={[styles.content,{paddingTop:space.md,paddingBottom:bottomPad}]} refreshing={refreshing}
    onRefresh={()=>{setRefreshing(true);setRetry(n=>n+1);}} showsVerticalScrollIndicator={false}/></View>;
}

function Header({ unreadCount, onMarkAll }: { unreadCount: number; onMarkAll: () => void }): React.JSX.Element {
  const t = useThemeColors();
  return (
    <View style={styles.header}>
      <View style={styles.headerTop}>
        <View>
          <Text allowFontScaling={false} style={[styles.eyebrow, { color: t.textMuted }]}>
            ACTIVITY
          </Text>
          <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
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
            hitSlop={8}
            style={styles.markAll}
          >
            <Text allowFontScaling={false} style={[styles.markAllText, { color: t.textSecondary }]}>
              Mark all read
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: layout.screenX },
  header: { paddingBottom: space.sm },
  headerTop: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  eyebrow: { ...typeScale.caption, letterSpacing: 0.8 },
  title: { ...typeScale.title },
  markAll: { paddingVertical: space.xs, paddingHorizontal: space.sm, minHeight: 44, justifyContent: 'center' },
  markAllText: { ...typeScale.meta },
  spinner: { paddingVertical: space.xxl, alignItems: 'center' },
});
