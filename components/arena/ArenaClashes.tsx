/** Discovery uses server states; preview reads never create Room membership. */
import React from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { LiveArenaTopic } from '../../services/liveArenaService';
import { fetchClashDiscovery } from '../../services/arenaClashDiscoveryService';
import { fetchClashView, type ClashView } from '../../services/clashEngineService';
import { useAuth } from '../../store/AuthProvider';
import { clashDiscoveryDestination, type ClashDiscoveryEntry, type ClashDiscoveryState } from '../../utils/arenaClashDiscovery';
import { layout, useThemeColors } from '../../theme';
import { press as hapticPress } from '../../utils/haptics';
import { Avatar } from '../shared/Avatar';
export interface ArenaClashesProps {
  topics: readonly LiveArenaTopic[];
  topicsLoading?: boolean;
  topicsError?: boolean;
  onEnter: (topic: LiveArenaTopic) => void;
  onWatch: (topic: LiveArenaTopic) => void;
}
const isLive = (topic: LiveArenaTopic): boolean => topic.status === 'live' && (topic.phase === 'open' || topic.phase === 'final_arguments');
export function ArenaClashes({
  topics,
  topicsLoading = false,
  topicsError = false,
  onEnter,
  onWatch
}: ArenaClashesProps): React.JSX.Element {
  const t = useThemeColors(),
    router = useRouter(),
    {
      user
    } = useAuth();
  const owner = user?.id ?? null;
  const [discovery, setDiscovery] = React.useState<{
    ownerId: string | null;
    entries: ClashDiscoveryEntry[];
  }>({
    ownerId: null,
    entries: []
  });
  const [loading, setLoading] = React.useState(true),
    [error, setError] = React.useState(false),
    [retry, setRetry] = React.useState(0);
  const entries = discovery.ownerId === owner ? discovery.entries : [];
  useFocusEffect(React.useCallback(() => {
    let active = true,
      request = 0;
    setDiscovery({
      ownerId: owner,
      entries: []
    });
    setLoading(Boolean(owner));
    setError(false);
    const load = async (): Promise<void> => {
      const current = ++request;
      if (!owner) return;
      try {
        const result = await fetchClashDiscovery();
        if (active && current === request) {
          setDiscovery({
            ownerId: owner,
            entries: result
          });
          setError(false);
        }
      } catch {
        if (active && current === request) setError(true);
      } finally {
        if (active && current === request) setLoading(false);
      }
    };
    void load();
    const timer = owner ? setInterval(() => void load(), 20_000) : null;
    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, [owner, retry]));
  const live = topics.filter(isLive),
    rest = topics.filter(topic => !isLive(topic));
  const liveEntries = entries.filter(entry => entry.state === 'LIVE');
  const openTopic = (topic: LiveArenaTopic): void => {
    hapticPress();
    if (topic.viewerRoomId) onEnter(topic);else onWatch(topic);
  };
  return <View style={styles.wrap} accessibilityLabel="Clashes">
    <Text style={[styles.kicker, {
      color: t.textMuted
    }]}>TWO SIDES. ONE STAGE.</Text>
    <Text accessibilityRole="header" style={[styles.title, {
      color: t.textPrimary
    }]}>Live Arena</Text>
    <Text style={[styles.body, {
      color: t.textSecondary
    }]}>Hear the arguments. Back a fighter. Make up your own mind.</Text>
    <View style={styles.shortcuts}>
      {([['Challenges', 'Invites and requests', '/arena/challenges'], ['Hall of Fame', 'Results and verdicts', '/arena/hall-of-fame']] as const).map(([title, sub, route]) => <Pressable key={route} accessibilityRole="button" accessibilityLabel={title === 'Challenges' ? 'Open Challenge Inbox' : 'Open Hall of Fame archive'} onPress={() => {
        hapticPress();
        router.push(route);
      }} style={[styles.shortcut, {
        borderColor: t.border,
        backgroundColor: t.surface
      }]}>
          <Text style={[styles.shortcutTitle, {
          color: t.textPrimary
        }]}>{title} ↗</Text><Text style={[styles.caption, {
          color: t.textMuted
        }]}>{sub}</Text>
        </Pressable>)}
    </View>
    <View style={styles.sectionHead}><Text accessibilityRole="header" style={[styles.heading, {
        color: t.textPrimary
      }]}>On the stage</Text><Text style={[styles.caption, {
        color: t.textMuted
      }]}>1v1 CLASHES</Text></View>
    {!owner ? <Pressable accessibilityRole="button" onPress={() => router.push('/auth')} style={[styles.notice, {
      borderColor: t.border
    }]}><Text style={[styles.heading, {
        color: t.textPrimary
      }]}>Find your ringside seat</Text><Text style={[styles.body, {
        color: t.textSecondary
      }]}>Sign in to discover Clashes and see your challenge history. ↗</Text></Pressable> : loading ? <Text style={[styles.status, {
      color: t.textMuted
    }]}>Checking live Clashes…</Text> : error ? <View style={styles.status}><Text accessibilityRole="alert" style={[styles.body, {
        color: t.textSecondary
      }]}>Live Clashes are unavailable. These are not empty results.</Text><Pressable accessibilityRole="button" onPress={() => setRetry(n => n + 1)} style={styles.action}><Text style={{
          color: t.textPrimary
        }}>Try again</Text></Pressable></View> : liveEntries.length === 0 ? <View style={[styles.notice, {
      borderColor: t.border
    }]}><Text style={[styles.heading, {
        color: t.textPrimary
      }]}>No live Clashes right now</Text><Text style={[styles.body, {
        color: t.textSecondary
      }]}>Pending invitations and completed results stay in their own sections below.</Text></View> : liveEntries.map((entry, index) => <DuelDiscoveryCard key={`${owner}:${entry.id}`} entry={entry} loadIdentity={index < 8} onOpen={() => {
      hapticPress();
      router.push(clashDiscoveryDestination(entry));
    }} />)}
    {(['PENDING', 'UPCOMING', 'COMPLETED'] as ClashDiscoveryState[]).filter(section => entries.some(entry => entry.state === section)).map(section => <View key={section} style={styles.history}>
      <Text accessibilityRole="header" style={[styles.heading, {
        color: t.textPrimary
      }]}>{section === 'PENDING' ? 'Awaiting acceptance' : section === 'UPCOMING' ? 'Coming up' : 'The archive'}</Text>
      {entries.filter(entry => entry.state === section).map(entry => <Pressable key={entry.id} accessibilityRole="button" accessibilityLabel={`${entry.state}. ${entry.title}. ${entry.kind === 'CHALLENGE' ? 'View Take' : 'Open Clash'}`} onPress={() => {
        hapticPress();
        router.push(clashDiscoveryDestination(entry));
      }} style={[styles.historyRow, {
        borderColor: t.border
      }]}>
        <Text style={[styles.kicker, {
          color: t.textMuted
        }]}>{entry.state} · {entry.status.toUpperCase()}</Text><Text style={[styles.rowTitle, {
          color: t.textPrimary
        }]}>{entry.title}</Text><Text style={[styles.caption, {
          color: t.textSecondary
        }]}>{entry.kind === 'CHALLENGE' ? 'View Take · Awaiting acceptance' : 'Open Clash'} ↗</Text>
      </Pressable>)}
    </View>)}
    <View style={styles.sectionHead}><Text accessibilityRole="header" style={[styles.heading, {
        color: t.textPrimary
      }]}>Topic rooms</Text><Text style={[styles.caption, {
        color: t.textMuted
      }]}>DISCUSS TOGETHER</Text></View>
    {topicsLoading ? <Text style={[styles.status, {
      color: t.textMuted
    }]}>Loading discussions…</Text> : topicsError ? <Text accessibilityRole="alert" style={[styles.status, {
      color: t.textMuted
    }]}>Couldn't load discussions. Pull down to retry.</Text> : topics.length === 0 ? <Text style={[styles.status, {
      color: t.textMuted
    }]}>No topic rooms to explore right now.</Text> : [...live, ...rest].map(topic => <Pressable key={topic.id} accessibilityRole="button" accessibilityLabel={`${isLive(topic) ? 'Live' : topic.phase}. ${topic.title}. ${topic.viewerRoomId ? 'Enter your room' : 'View topic'}`} onPress={() => openTopic(topic)} style={[styles.historyRow, {
      borderColor: t.border
    }]}>
        <View style={styles.metaRow}><Text style={[styles.kicker, {
          color: isLive(topic) ? '#C86156' : t.textMuted
        }]}>{isLive(topic) ? 'LIVE DISCUSSION' : topic.phase.replace(/_/g, ' ').toUpperCase()}</Text><Text style={[styles.caption, {
          color: t.textMuted
        }]}>{topic.participantCount} joined</Text></View>
        <Text style={[styles.rowTitle, {
        color: t.textPrimary
      }]}>{topic.title}</Text><Text style={[styles.caption, {
        color: t.textSecondary
      }]}>{topic.viewerRoomId ? 'Enter your room' : 'View discussion'} ↗</Text>
      </Pressable>)}
  </View>;
}
function DuelDiscoveryCard({
  entry,
  loadIdentity,
  onOpen
}: {
  entry: ClashDiscoveryEntry;
  loadIdentity: boolean;
  onOpen: () => void;
}): React.JSX.Element {
  const t = useThemeColors();
  const {
    user
  } = useAuth();
  const owner = user?.id ?? null;
  const [preview, setPreview] = React.useState<{
    owner: string;
    view: ClashView | null;
  } | null>(null);
  useFocusEffect(React.useCallback(() => {
    let active = true;
    setPreview(null);
    if (owner && loadIdentity) void fetchClashView(entry.id).then(view => {
      if (active) setPreview({
        owner,
        view: view && view.clashId === entry.id && view.roomId === entry.roomId ? view : null
      });
    }).catch(() => undefined);
    return () => {
      active = false;
    };
  }, [entry.id, entry.roomId, owner, loadIdentity]));
  const view = preview?.owner === owner ? preview?.view : null;
  const ended = view && view.status !== 'open';
  if (preview?.owner === owner && !preview.view) return <View style={[styles.notice, {
    borderColor: t.border
  }]}><Text style={[styles.body, {
      color: t.textSecondary
    }]}>This Clash is no longer available. Pull down to refresh discovery.</Text></View>;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${ended ? 'View' : 'Watch live'} Clash: ${entry.title}`} onPress={onOpen} style={({
    pressed
  }) => [styles.duelCard, {
    backgroundColor: t.surface,
    borderColor: t.border,
    opacity: pressed ? 0.8 : 1
  }]}>
    <View style={styles.metaRow}><Text style={[styles.kicker, {
        color: ended ? t.textMuted : '#C86156'
      }]}>{ended ? view.status.toUpperCase() : entry.roomId ? 'LIVE · 1v1' : 'LIVE CLASH'}</Text><Text style={[styles.caption, {
        color: t.textMuted
      }]}>ARENA</Text></View>
    <Text style={[styles.proposition, {
      color: t.textPrimary
    }]}>{entry.title}</Text>
    {entry.roomId ? <View style={styles.fighters}>
      {(['A', 'B'] as const).map((side, i) => {
        const fighter = view?.revealed ? side === 'A' ? view.sideA : view.sideB : null;
        return <React.Fragment key={side}>{i === 1 ? <Text style={[styles.versus, {
            color: t.textMuted
          }]}>vs</Text> : null}
          <View style={[styles.fighter, {
            borderColor: side === 'A' ? '#A3524C' : '#4C6C9C'
          }]}>
            {fighter ? <Avatar name={fighter.name} tint={fighter.tint} size={28} /> : <Text style={[styles.fighterLetter, {
              color: t.textSecondary
            }]}>{side}</Text>}
            <View style={{
              flex: 1,
              minWidth: 0
            }}><Text style={[styles.caption, {
                color: t.textMuted
              }]}>FIGHTER {side}</Text><Text numberOfLines={2} style={[styles.fighterName, {
                color: t.textPrimary
              }]}>{fighter?.name ?? (view?.mode === 'BLIND' && !view.revealed ? 'Identity hidden' : 'View in room')}</Text></View>
          </View>
        </React.Fragment>;
      })}
    </View> : null}
    <View style={[styles.entry, {
      borderColor: t.border
    }]}><Text style={[styles.entryText, {
        color: t.textPrimary
      }]}>{ended ? 'View result' : entry.roomId ? 'Watch the duel' : 'View Clash'}</Text><Text style={{
        color: t.textPrimary,
        fontSize: 22
      }}>↗</Text></View>
  </Pressable>;
}
const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: layout.screenX,
    paddingTop: 20,
    paddingBottom: 28,
    gap: 12
  },
  kicker: {
    fontSize: 10,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 1.4
  },
  title: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '800',
    letterSpacing: -1.2
  },
  body: {
    fontSize: 14,
    lineHeight: 21
  },
  caption: {
    fontSize: 11,
    lineHeight: 17
  },
  shortcuts: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8
  },
  shortcut: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 14,
    minHeight: 72,
    gap: 6
  },
  shortcutTitle: {
    fontSize: 14,
    fontWeight: '700'
  },
  sectionHead: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 20
  },
  heading: {
    fontSize: 18,
    lineHeight: 25,
    fontWeight: '700',
    letterSpacing: -0.4
  },
  notice: {
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    gap: 8
  },
  status: {
    paddingVertical: 16
  },
  action: {
    minHeight: 44,
    justifyContent: 'center'
  },
  history: {
    gap: 12,
    marginTop: 16
  },
  historyRow: {
    paddingVertical: 18,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth
  },
  rowTitle: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '600',
    letterSpacing: -0.3
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8
  },
  duelCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    padding: 18,
    gap: 20
  },
  proposition: {
    fontSize: 23,
    lineHeight: 30,
    fontWeight: '700',
    letterSpacing: -0.6
  },
  fighters: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  fighter: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 8,
    borderLeftWidth: 2
  },
  fighterLetter: {
    fontSize: 20,
    fontWeight: '700'
  },
  fighterName: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600'
  },
  versus: {
    fontSize: 11,
    fontStyle: 'italic'
  },
  entry: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 14,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  entryText: {
    fontSize: 14,
    fontWeight: '700'
  }
});
