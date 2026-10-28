import { releaseAllows, releaseUnavailableCopy } from '../../../utils/releaseScope';
import React from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Users } from 'lucide-react-native';
import { GroupMark, GroupSpecialties } from '../../../components/arena/groups/GroupIdentity';
import { GroupButton } from '../../../components/arena/groups/GroupButton';
import { Avatar } from '../../../components/shared/Avatar';
import { useRequireAuth } from '../../../hooks/useRequireAuth';
import { useAuth } from '../../../store/AuthProvider';
import { followArenaCrew, getArenaCrew, joinArenaCrew, leaveArenaCrew, listArenaCrewMembers, requestArenaCrewJoin, unfollowArenaCrew, type ArenaCrew, type ArenaCrewMember } from '../../../services/arenaCrewService';
import { errorText } from '../../../services/supabaseClient';
import { arenaCrewErrorKey } from '../../../utils/arenaCrewPayload';
import { crewJoinAction, crewJoinModeLabel } from '../../../utils/arenaCrewIdentity';
import { layout, useThemeColors } from '../../../theme';
const LIMIT = 32;
export default function CrewProfileScreen(): React.JSX.Element {
  const {
    slug: param
  } = useLocalSearchParams<{
    slug?: string | string[];
  }>();
  const slug = Array.isArray(param) ? param[0] : param;
  const t = useThemeColors(),
    insets = useSafeAreaInsets(),
    router = useRouter(),
    requireAuth = useRequireAuth();
  const {
    user,
    signedIn,
    loading: authLoading
  } = useAuth();
  const identity = `${signedIn ? user?.id ?? '' : ''}:${slug ?? ''}`;
  const identityRef = React.useRef(identity);
  identityRef.current = identity;
  const generation = React.useRef(0);
  const [record, setRecord] = React.useState<{
    identity: string;
    crew: ArenaCrew | null;
  } | null>(null);
  const [members, setMembers] = React.useState<ArenaCrewMember[]>([]);
  const [memberOffset, setMemberOffset] = React.useState(0),
    [hasMore, setHasMore] = React.useState(false);
  const [tab, setTab] = React.useState<'about' | 'members'>('about');
  const [busy, setBusy] = React.useState(false),
    [memberBusy, setMemberBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null),
    [notice, setNotice] = React.useState<string | null>(null);
  const [retry, setRetry] = React.useState(0);
  useFocusEffect(React.useCallback(() => {
    const token = ++generation.current;
    const valid = (): boolean => generation.current === token && identityRef.current === identity;
    setRecord(null);
    setMembers([]);
    setError(null);
    setNotice(null);
    setBusy(false);
    setMemberBusy(false);
    setMemberOffset(0);
    setHasMore(false);
    if (authLoading) return () => {
      generation.current++;
    };
    if (!signedIn || !slug) {
      setRecord({
        identity,
        crew: null
      });
      return () => {
        generation.current++;
      };
    }
    void getArenaCrew(slug).then(async crew => {
      if (!valid()) return;
      setRecord({
        identity,
        crew
      });
      if (crew) {
        try {
          const rows = await listArenaCrewMembers(crew.id, {
            limit: LIMIT
          });
          if (valid()) {
            setMembers(rows);
            setHasMore(rows.length === LIMIT);
          }
        } catch {
          if (valid()) setError('Members couldn’t be loaded. Try again.');
        }
      }
    }).catch(() => {
      if (valid()) {
        setRecord({
          identity,
          crew: null
        });
        setError('This group couldn’t be loaded.');
      }
    });
    return () => {
      generation.current++;
    };
  }, [identity, slug, signedIn, authLoading, retry]));
  const current = record?.identity === identity ? record : null;
  const crew = current?.crew;
  const perform = async (operation: () => Promise<unknown>, success?: string): Promise<void> => {
    if (!requireAuth() || !crew || busy) return;
    const token = generation.current,
      owner = identity;
    const valid = (): boolean => generation.current === token && identityRef.current === owner;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await operation();
      if (!valid()) return;
      const next = await getArenaCrew(crew.slug);
      if (!valid()) return;
      setRecord({
        identity: owner,
        crew: next
      });
      if (success) setNotice(success);
      setMembers([]);
      setHasMore(false);
      setMemberOffset(0);
      if (next) {
        const rows = await listArenaCrewMembers(next.id, {
          limit: LIMIT
        });
        if (valid()) {
          setMembers(rows);
          setHasMore(rows.length === LIMIT);
        }
      }
    } catch (e) {
      if (!valid()) return;
      const key = arenaCrewErrorKey(errorText(e));
      setError(key === 'already_in_crew' ? 'You already belong to a Crew. Leave it before joining another.' : key === 'cooldown' ? 'Rejoin cooldown is active. Try again later.' : key === 'request_already_pending' ? 'Your request is already pending.' : errorText(e));
    } finally {
      if (valid()) setBusy(false);
    }
  };
  const moreMembers = async (): Promise<void> => {
    if (!crew || memberBusy || !hasMore) return;
    const token = generation.current,
      owner = identity,
      nextOffset = memberOffset + LIMIT;
    setMemberBusy(true);
    try {
      const rows = await listArenaCrewMembers(crew.id, {
        limit: LIMIT,
        offset: nextOffset
      });
      if (generation.current !== token || identityRef.current !== owner) return;
      setMembers(prev => [...prev, ...rows.filter(row => !prev.some(m => m.profileId === row.profileId))]);
      setMemberOffset(nextOffset);
      setHasMore(rows.length === LIMIT);
    } catch {
      if (generation.current === token && identityRef.current === owner) setError('More members couldn’t be loaded. Try again.');
    } finally {
      if (generation.current === token && identityRef.current === owner) setMemberBusy(false);
    }
  };
  const action = crew ? crewJoinAction(crew.joinMode, crew.viewer, crew.id) : null;
  const actionLabel = action === 'join' ? 'Join group' : action === 'request' ? 'Request to join' : action === 'pending' ? 'Request pending' : action === 'member' ? 'Joined' : action === 'invite_only' ? 'Invite only' : 'One Crew at a time';
  return <View style={[styles.screen, {
    backgroundColor: t.background
  }]}>
    <View style={[styles.bar, {
      paddingTop: insets.top,
      borderColor: t.border
    }]}><Pressable accessibilityRole="button" accessibilityLabel="Go back" style={styles.back} onPress={() => router.back()}><ArrowLeft size={22} color={t.textPrimary} /></Pressable><Text style={[styles.barTitle, {
        color: t.textPrimary
      }]}>Group</Text></View>
    {!signedIn && !authLoading ? <View style={styles.body}><Text style={[styles.title, {
        color: t.textPrimary
      }]}>Your people are here.</Text><GroupButton label="Sign in" onPress={() => {
        requireAuth();
      }} /></View> : !current ? <ActivityIndicator style={{
      marginTop: 40
    }} color={t.textMuted} accessibilityLabel="Loading group" /> : !crew ? <View style={styles.body}><Text style={[styles.title, {
        color: t.textPrimary
      }]}>{error ? 'Couldn’t load group' : 'Group unavailable'}</Text><Text style={[styles.bodyText, {
        color: t.textSecondary
      }]}>{error ?? 'This group may no longer be available to you.'}</Text><GroupButton label={error ? 'Try again' : 'Explore groups'} onPress={() => error ? setRetry(n => n + 1) : router.replace('/arena/crews')} /></View> : <ScrollView contentContainerStyle={{
      paddingBottom: insets.bottom + 32
    }}>
            {crew.bannerUrl ? <Image source={{
        uri: crew.bannerUrl
      }} style={styles.banner} accessibilityIgnoresInvertColors /> : <View style={[styles.cover, {
        backgroundColor: t.surfaceElevated
      }]}><Users size={42} color={t.textMuted} /><Text style={[styles.coverLabel, {
          color: t.textMuted
        }]}>A SHARED POINT OF VIEW</Text></View>}
            <View style={styles.body}><GroupMark crew={crew} size={76} /><Text style={[styles.title, {
          color: t.textPrimary
        }]}>{crew.name}</Text><Text style={[styles.handle, {
          color: t.textMuted
        }]}>g/{crew.slug} · {crewJoinModeLabel(crew.joinMode)}</Text>
              <GroupSpecialties crew={crew} />
              <View style={styles.stats}><View><Text style={[styles.number, {
              color: t.textPrimary
            }]}>{crew.memberCount.toLocaleString()}</Text><Text style={[styles.handle, {
              color: t.textMuted
            }]}>members</Text></View><View><Text style={[styles.number, {
              color: t.textPrimary
            }]}>{crew.followerCount.toLocaleString()}</Text><Text style={[styles.handle, {
              color: t.textMuted
            }]}>followers</Text></View></View>
              <GroupButton label={action === 'member' || releaseAllows('groups', 'admit') ? actionLabel : 'New membership unavailable'} busy={busy} disabled={!releaseAllows('groups', 'admit') || action !== 'join' && action !== 'request'} onPress={() => {
          void perform(() => action === 'join' ? joinArenaCrew(crew.id) : requestArenaCrewJoin(crew.id), action === 'request' ? 'Your request has been sent.' : undefined);
        }} />
              {!crew.viewer.isMember ? <GroupButton secondary label={crew.viewer.isFollowing ? 'Following · Unfollow' : 'Follow group'} busy={busy} disabled={!crew.viewer.isFollowing && !releaseAllows('groups', 'admit')} onPress={() => {
          void perform(() => crew.viewer.isFollowing ? unfollowArenaCrew(crew.id) : followArenaCrew(crew.id));
        }} /> : null}
              {!releaseAllows('groups', 'admit') ? <Text style={[styles.bodyText, { color: t.textSecondary }]}>{releaseUnavailableCopy('groups')}</Text> : null}
              {action === 'blocked_other' ? <Text style={[styles.bodyText, {
          color: t.textSecondary
        }]}>You can follow many groups, but belong to one competitive Crew.</Text> : action === 'invite_only' ? <Text style={[styles.bodyText, {
          color: t.textSecondary
        }]}>Membership is by invitation. You can follow this group while you wait.</Text> : null}
              {notice ? <Text accessibilityLiveRegion="polite" style={[styles.bodyText, {
          color: t.textSecondary
        }]}>{notice}</Text> : null}
              {error ? <View><Text accessibilityRole="alert" style={[styles.bodyText, {
            color: t.textSecondary
          }]}>{error}</Text><GroupButton secondary label="Refresh group" onPress={() => setRetry(n => n + 1)} /></View> : null}
              <View style={[styles.tabs, {
          borderColor: t.border
        }]}>{(['about', 'members'] as const).map(key => <Pressable key={key} accessibilityRole="tab" accessibilityState={{
            selected: tab === key
          }} style={[styles.tab, {
            borderBottomColor: tab === key ? t.textPrimary : 'transparent'
          }]} onPress={() => setTab(key)}><Text style={{
              fontSize: 14,
              fontWeight: '600',
              color: tab === key ? t.textPrimary : t.textMuted
            }}>{key === 'about' ? 'About' : 'Members'}</Text></Pressable>)}</View>
              {tab === 'about' ? <><Text style={[styles.section, {
            color: t.textPrimary
          }]}>What brings us together</Text><Text style={[styles.bodyText, {
            color: t.textSecondary
          }]}>{crew.bio || 'This group hasn’t added a description yet.'}</Text>
                <View style={[styles.record, {
            backgroundColor: t.surface
          }]}><Text style={[styles.section, {
              color: t.textPrimary
            }]}>Crew record</Text><Text style={[styles.bodyText, {
              color: t.textSecondary
            }]}>{crew.wins} wins · {crew.losses} losses</Text><Text style={[styles.handle, {
              color: t.textMuted
            }]}>{crew.totalReputation.toLocaleString()} reputation · {crew.streak} win streak</Text></View>
                {crew.viewer.isMember && crew.viewer.role !== 'OWNER' ? <GroupButton secondary label="Leave group" busy={busy} onPress={() => Alert.alert('Leave this group?', 'You’ll leave your Crew membership. Rejoin rules still apply.', [{
            text: 'Stay',
            style: 'cancel'
          }, {
            text: 'Leave',
            style: 'destructive',
            onPress: () => {
              if (identityRef.current === identity) void perform(() => leaveArenaCrew(crew.id));
            }
          }])} /> : null}
              </> : <><Text style={[styles.handle, {
            color: t.textMuted
          }]}>Showing {members.length} of {crew.memberCount} members</Text>{members.map(member => <Pressable key={member.profileId} accessibilityRole="button" accessibilityLabel={`Open ${member.name}'s profile`} onPress={() => router.push(`/profile/${member.profileId}`)} style={[styles.member, {
            borderColor: t.border
          }]}><Avatar name={member.name} tint={member.tint} size={40} /><View style={{
              flex: 1
            }}><Text style={[styles.memberName, {
                color: t.textPrimary
              }]}>{member.name}</Text><Text style={[styles.handle, {
                color: t.textMuted
              }]}>@{member.handle.replace(/^@/, '')}</Text></View><Text style={[styles.role, {
              color: t.textMuted
            }]}>{member.role.toLowerCase()}</Text></Pressable>)}
                {!members.length && !error ? <Text style={[styles.bodyText, {
            color: t.textMuted
          }]}>No members available to show.</Text> : null}
                {hasMore ? <GroupButton secondary label="More members" busy={memberBusy} onPress={() => {
            void moreMembers();
          }} /> : null}</>}
            </View>
          </ScrollView>}
  </View>;
}
const styles = StyleSheet.create({
  screen: {
    flex: 1
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.screenX,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth
  },
  back: {
    width: 44,
    height: 48,
    justifyContent: 'center'
  },
  barTitle: {
    fontSize: 17,
    fontWeight: '600'
  },
  banner: {
    height: 150,
    width: '100%'
  },
  cover: {
    height: 144,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12
  },
  coverLabel: {
    fontSize: 9,
    letterSpacing: 3,
    fontWeight: '600'
  },
  body: {
    padding: layout.screenX,
    gap: 16
  },
  title: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '800',
    letterSpacing: -1
  },
  handle: {
    fontSize: 12,
    lineHeight: 18
  },
  stats: {
    flexDirection: 'row',
    gap: 36
  },
  number: {
    fontSize: 24,
    fontWeight: '700'
  },
  bodyText: {
    fontSize: 14,
    lineHeight: 22
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth
  },
  tab: {
    minHeight: 48,
    paddingHorizontal: 20,
    justifyContent: 'center',
    borderBottomWidth: 2
  },
  section: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3
  },
  record: {
    padding: 18,
    borderRadius: 18,
    gap: 10
  },
  member: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 68,
    borderBottomWidth: StyleSheet.hairlineWidth
  },
  memberName: {
    fontSize: 14,
    fontWeight: '600'
  },
  role: {
    fontSize: 11,
    textTransform: 'capitalize'
  }
});
