/** Real catalogue/trend constellation; lines represent shared communities. */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import Svg, { Line } from 'react-native-svg';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { fetchInterestCatalogue } from '../../services/arenaInterestService';
import { fetchLiveTopics, type LiveArenaTopic } from '../../services/liveArenaService';
import { fetchTrendingBattles, type ArenaTrendingBattle } from '../../services/arenaTrendService';
import type { ArenaInterest } from '../../utils/arenaInterests';
import { layout, useThemeColors } from '../../theme';
import { useAuth } from '../../store/AuthProvider';
import { ArenaQuestions } from './ArenaQuestions';
import { constellationLayout, type TopicNode } from '../../utils/topicConstellation';
export { constellationLayout } from '../../utils/topicConstellation';
export type { TopicNode } from '../../utils/topicConstellation';
export function ArenaTopics({
  refreshToken = 0,
  onOpenTopic,
  onOpenRoom
}: {
  refreshToken?: number;
  onOpenTopic: (id: string) => void;
  onOpenRoom: (id: string) => void;
}): React.JSX.Element {
  const t = useThemeColors(),
    router = useRouter(),
    {
      signedIn,
      user
    } = useAuth();
  const reduced = useReducedMotion(),
    {
      width,
      fontScale
    } = useWindowDimensions();
  const [snapshot, setSnapshot] = React.useState<{
    owner: string | null;
    catalogue: ArenaInterest[];
    topics: LiveArenaTopic[];
    trends: ArenaTrendingBattle[];
  }>({
    owner: null,
    catalogue: [],
    topics: [],
    trends: []
  });
  const [busy, setLoading] = React.useState(true);
  const [errors, setErrors] = React.useState({
    catalogue: false,
    topics: false,
    trends: false
  });
  const [retry, setRetry] = React.useState(0),
    [selected, setSelected] = React.useState<string | null>(null);
  const [questionTopic, setQuestionTopic] = React.useState<string | undefined>();
  const [mode, setMode] = React.useState<'interest' | 'trend'>('interest');
  const owner = user?.id ?? null;
  const loading = busy || snapshot.owner !== owner;
  const {
    catalogue,
    topics,
    trends
  } = snapshot.owner === owner ? snapshot : {
    catalogue: [],
    topics: [],
    trends: []
  };
  useFocusEffect(React.useCallback(() => {
    let active = true;
    setLoading(true);
    setSelected(null);
    setQuestionTopic(undefined);
    setSnapshot({
      owner,
      catalogue: [],
      topics: [],
      trends: []
    });
    setErrors({
      catalogue: false,
      topics: false,
      trends: false
    });
    // Never use development fixture fallback for the trend map.
    void Promise.allSettled([signedIn ? fetchInterestCatalogue() : Promise.resolve([]), fetchLiveTopics(), fetchTrendingBattles(10, true)]).then(([interests, discussions, trending]) => {
      if (!active) return;
      setSnapshot({
        owner,
        catalogue: interests.status === 'fulfilled' ? interests.value : [],
        topics: discussions.status === 'fulfilled' ? discussions.value : [],
        trends: trending.status === 'fulfilled' ? trending.value : []
      });
      setErrors({
        catalogue: interests.status === 'rejected',
        topics: discussions.status === 'rejected',
        trends: trending.status === 'rejected'
      });
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [refreshToken, signedIn, owner, retry]));
  const nodes: TopicNode[] = mode === 'interest' ? catalogue.map(item => ({
    id: item.id,
    label: item.name,
    hoods: item.hoods
  })) : trends.map(item => ({
    id: item.topicId,
    label: item.title,
    hoods: item.hood ? [item.hood] : []
  }));
  const graph = constellationLayout(nodes, Math.max(200, width - layout.screenX * 2 - 2), fontScale);
  const chosen = nodes.find(node => node.id === selected);
  const interest = mode === 'interest' ? catalogue.find(item => item.id === selected) : null;
  const trend = mode === 'trend' ? trends.find(item => item.topicId === selected) : null;
  const graphError = mode === 'interest' ? errors.catalogue : errors.trends;
  return <View style={styles.wrap} accessibilityLabel="Topics and Trends">
    <Text style={[styles.eyebrow, {
      color: t.textMuted
    }]}>FOLLOW YOUR CURIOSITY</Text>
    <Text accessibilityRole="header" style={[styles.title, {
      color: t.textPrimary
    }]}>Ideas connect.</Text>
    <Text style={[styles.body, {
      color: t.textSecondary
    }]}>Explore a topic. Find your next conversation.</Text>
    <View style={styles.filters} accessibilityRole="tablist">{(['interest', 'trend'] as const).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{
        selected: mode === value
      }} onPress={() => {
        setMode(value);
        setSelected(null);
      }} style={[styles.filter, {
        backgroundColor: mode === value ? t.textPrimary : t.surface
      }]}>
        <Text style={[styles.filterText, {
          color: mode === value ? t.background : t.textSecondary
        }]}>{value === 'interest' ? 'Topic map' : 'Trending now'}</Text>
      </Pressable>)}</View>
    {loading ? <Text style={[styles.status, {
      color: t.textMuted
    }]}>Finding connections…</Text> : graphError ? <View style={styles.status}><Text accessibilityRole="alert" style={{
        color: t.textSecondary
      }}>Couldn't load this map.</Text><Pressable accessibilityRole="button" onPress={() => setRetry(n => n + 1)} style={styles.link}><Text style={{
          color: t.textPrimary
        }}>Try again</Text></Pressable></View> : mode === 'interest' && !signedIn ? <Pressable accessibilityRole="button" onPress={() => router.push('/auth')} style={styles.link}><Text style={{
        color: t.textPrimary
      }}>Sign in to explore the topic catalogue</Text></Pressable> : nodes.length === 0 ? <Text style={[styles.status, {
      color: t.textMuted
    }]}>{mode === 'trend' ? 'No trending conversations available.' : 'No topics available.'}</Text> : <><ScrollView nestedScrollEnabled style={[styles.graph, {
        borderColor: t.border,
        backgroundColor: t.surface
      }]} accessibilityLabel="Topic constellation. Scroll to explore all nodes.">
        <View style={{
          height: graph.height
        }}>
          <Svg width="100%" height={graph.height} style={StyleSheet.absoluteFill} pointerEvents="none" accessible={false}>
            {graph.edges.map(([a, b]) => <Line key={`${a}-${b}`} x1={graph.points[a].x} y1={graph.points[a].y + 22} x2={graph.points[b].x} y2={graph.points[b].y + 22} stroke={t.border} strokeWidth={selected === graph.points[a].id || selected === graph.points[b].id ? 2 : 1} />)}
          </Svg>
          {graph.points.map(node => <Pressable key={node.id} accessibilityRole="button" accessibilityLabel={`Explore ${node.label}`} accessibilityState={{
            selected: selected === node.id
          }} onPress={() => setSelected(node.id)} style={[styles.node, {
            left: node.x - graph.cell / 2 + 4,
            top: node.y,
            width: graph.cell - 8
          }]}>
            <View style={[styles.nodeMark, {
              backgroundColor: selected === node.id ? t.textPrimary : t.surfaceElevated,
              borderColor: t.border
            }]}><Text style={[styles.glyph, {
                color: selected === node.id ? t.background : t.textPrimary
              }]}>{mode === 'trend' ? '↗' : '#'}</Text></View>
            <Text numberOfLines={3} style={[styles.nodeLabel, {
              color: selected === node.id ? t.textPrimary : t.textSecondary
            }]}>{node.label}</Text>
          </Pressable>)}
        </View>
      </ScrollView><Text style={[styles.legend, {
        color: t.textMuted
      }]}>Tap a node · Lines connect shared communities · Scroll for more</Text></>}
    {chosen ? <Animated.View key={`${mode}:${chosen.id}`} entering={reduced ? undefined : FadeIn.duration(160)} style={[styles.detail, {
      borderColor: t.border
    }]}>
      <Text style={[styles.heading, {
        color: t.textPrimary
      }]}>{chosen.label}</Text>
      {interest ? <><Text style={[styles.body, {
          color: t.textSecondary
        }]}>{interest.description}</Text><View style={styles.links}>
        {interest.hoods.map(hood => <Pressable key={hood} accessibilityRole="button" onPress={() => router.push('/hood/' + hood)} style={[styles.chip, {
            borderColor: t.border
          }]}><Text style={{
              color: t.textPrimary
            }}>Explore {hood} ↗</Text></Pressable>)}</View>
        <Pressable accessibilityRole="button" onPress={() => setQuestionTopic(interest.id)} style={styles.link}><Text style={{
            color: t.textPrimary
          }}>Questions about {interest.name} ↓</Text></Pressable></> : null}
      {trend ? <><Text style={[styles.body, {
          color: t.textMuted
        }]}>{trend.topicStatus.replace(/_/g, ' ')} · {trend.participantCount} joined</Text><Pressable accessibilityRole="button" onPress={() => trend.hotRoomId ? onOpenRoom(trend.hotRoomId) : onOpenTopic(trend.topicId)} style={styles.link}><Text style={{
            color: t.textPrimary
          }}>Open conversation ↗</Text></Pressable></> : null}
    </Animated.View> : null}
    <View style={styles.sectionHead}><Text accessibilityRole="header" style={[styles.heading, {
        color: t.textPrimary
      }]}>Questions worth asking</Text>
      {questionTopic ? <Pressable accessibilityRole="button" onPress={() => setQuestionTopic(undefined)} style={styles.link}><Text style={{
          color: t.textSecondary
        }}>All questions</Text></Pressable> : null}</View>
    <ArenaQuestions topicId={snapshot.owner === owner ? questionTopic : undefined} refreshToken={refreshToken} />
    <Text accessibilityRole="header" style={[styles.heading, {
      color: t.textPrimary
    }]}>Active discussions</Text>
    {loading ? <Text style={{
      color: t.textMuted
    }}>Loading discussions…</Text> : errors.topics ? <Text accessibilityRole="alert" style={{
      color: t.textMuted
    }}>Couldn't load discussions. Pull down to retry.</Text> : topics.length === 0 ? <Text style={{
      color: t.textMuted
    }}>No active discussions right now.</Text> : topics.map(topic => <Pressable key={topic.id} accessibilityRole="button" accessibilityLabel={'Open discussion ' + topic.title} onPress={() => topic.viewerRoomId ? onOpenRoom(topic.viewerRoomId) : onOpenTopic(topic.id)} style={[styles.discussion, {
      borderColor: t.border
    }]}>
        <Text style={[styles.discussionTitle, {
        color: t.textPrimary
      }]}>{topic.title}</Text><Text style={{
        color: t.textMuted
      }}>Open discussion ↗</Text></Pressable>)}
  </View>;
}
const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: layout.screenX,
    paddingTop: 20,
    paddingBottom: 28,
    gap: 12
  },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1.7,
    fontWeight: '700'
  },
  title: {
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -1.2,
    fontWeight: '800'
  },
  body: {
    fontSize: 14,
    lineHeight: 21
  },
  heading: {
    fontSize: 18,
    lineHeight: 25,
    fontWeight: '700',
    letterSpacing: -0.4
  },
  filters: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8
  },
  filter: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    justifyContent: 'center'
  },
  filterText: {
    fontSize: 13,
    fontWeight: '700'
  },
  status: {
    paddingVertical: 24
  },
  graph: {
    height: 360,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20
  },
  node: {
    position: 'absolute',
    alignItems: 'center',
    minHeight: 44,
    gap: 7
  },
  nodeMark: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  glyph: {
    fontSize: 22,
    fontWeight: '500'
  },
  nodeLabel: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
    textAlign: 'center'
  },
  legend: {
    fontSize: 11,
    lineHeight: 17
  },
  detail: {
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8
  },
  links: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  chip: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center'
  },
  link: {
    minHeight: 44,
    justifyContent: 'center'
  },
  sectionHead: {
    marginTop: 16,
    gap: 4
  },
  discussion: {
    paddingVertical: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10
  },
  discussionTitle: {
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '600'
  }
});
