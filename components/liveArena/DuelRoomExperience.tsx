/**
 * Canonical Duel — immersive full-screen Clash event.
 * Official arguments on Stage; Crowd is a separate live layer.
 * No permanent Arguments | Crowd | Evidence tab bar.
 */
import React from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { ArenaEvidence, ArenaMessage, ArenaRoom } from '../../services/liveArenaService';
import { layout, space, typeScale, useThemeColors } from '../../theme';
import { duelAtmosphereMood } from '../../utils/arenaAtmosphere';
import {
  duelLatestMoment,
  duelPresentation,
  duelTranscript,
} from '../../utils/duelPresentation';
import { press as hapticPress, tap as hapticTap } from '../../utils/haptics';
import { BackIcon } from '../shared/icons';
import { PressableScale } from '../shared/PressableScale';
import { ArenaAtmosphere } from './ArenaAtmosphere';
import { ArgumentHistorySheet } from './ArgumentHistorySheet';
import { ClashMoreSheet } from './ClashMoreSheet';
import { DuelDevPanel } from './DuelDevPanel';
import { DuelEntrance } from './DuelEntrance';
import { DuelRoomOutcome } from './DuelRoomOutcome';
import { ImmersiveClash } from './ImmersiveClash';
import { softFill } from './liveArenaStyles';
import type { LiveRoomMessageProps } from './LiveRoomMessage';
import { useArenaCrowd } from '../../hooks/useArenaCrowd';
import type { CrowdMessage } from '../../utils/arenaCrowd';

type Actions = Pick<
  LiveRoomMessageProps,
  | 'onReply'
  | 'onExpressiveReply'
  | 'onReact'
  | 'onOpenProfile'
  | 'onReport'
  | 'onMarkEvidence'
  | 'onReportEvidence'
>;

interface Props extends Actions {
  room: ArenaRoom;
  messages: readonly ArenaMessage[];
  evidence: readonly ArenaEvidence[];
  paddingTop: number;
  paddingBottom: number;
  spectatorCount: number | null;
  loading: boolean;
  refreshing: boolean;
  loadingOlder: boolean;
  hasOlder: boolean;
  threadLocked: boolean;
  error: string | null;
  composer: React.ReactNode;
  onBack: () => void;
  onReturn: () => void;
  onRefresh: () => Promise<void>;
  onLoadOlder: () => Promise<void>;
  onJudge: (side: 'A' | 'B') => Promise<void>;
  onWatch: () => Promise<void>;
  onReportCrowd?: (message: CrowdMessage) => void;
}

function DuelLoadingBones(): React.JSX.Element {
  const t = useThemeColors();
  const bone = softFill(t);
  return (
    <View style={styles.bones} accessibilityLabel="Loading Clash transcript">
      <View style={[styles.boneLine, { backgroundColor: bone, width: '88%' }]} />
      <View style={[styles.boneLine, { backgroundColor: bone, width: '64%' }]} />
      <View style={[styles.boneBlock, { backgroundColor: bone }]} />
    </View>
  );
}

/** Official Stage and independently authorized public Crowd within one event. */
export function DuelRoomExperience(props: Props): React.JSX.Element {
  const { room, messages } = props;
  const duel = room.duel!;
  const crowd = useArenaCrowd(props.threadLocked ? null : room.roomId);
  React.useEffect(() => { if (props.refreshing) void crowd.refresh(); },[props.refreshing,crowd.refresh]);
  const t = useThemeColors();
  const presentation = duelPresentation(duel, room.phase);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [backingSide, setBackingSide] = React.useState<'A' | 'B' | null>(null);
  const [watching, setWatching] = React.useState(false);
  const [watchError, setWatchError] = React.useState(false);
  const [entrance, setEntrance] = React.useState(true);
  const [keyboardOpen, setKeyboardOpen] = React.useState(false);
  const joining = React.useRef(false);
  const lastMomentId = React.useRef<string | null>(null);

  const transcript = React.useMemo(
    () => duelTranscript(duel, messages),
    [duel, messages],
  );
  const moment = React.useMemo(
    () => duelLatestMoment(duel, messages),
    [duel, messages],
  );

  const proposition = duel.sourceText?.trim() || room.topic.title;
  const live =
    duel.status === 'open' &&
    (room.phase === 'open' || room.phase === 'final_arguments');
  const statusLabel = live ? 'LIVE' : presentation.stage.toUpperCase();
  const atmosphereMood = duelAtmosphereMood(duel, room.phase);
  const judgingFocus = room.phase === 'judging' && duel.status === 'open';
  const showOutcome =
    room.phase === 'judging' ||
    room.phase === 'closed' ||
    duel.status !== 'open' ||
    duel.hasJudged;

  React.useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  React.useEffect(() => {
    const id = moment.message?.id ?? null;
    if (id && lastMomentId.current && lastMomentId.current !== id && live) {
      hapticTap();
    }
    lastMomentId.current = id;
  }, [live, moment.message?.id]);

  const canBack =
    !presentation.side &&
    duel.status === 'open' &&
    (room.phase === 'open' || room.phase === 'final_arguments');

  const retry = (
    <Pressable
      disabled={props.refreshing}
      accessibilityRole="button"
      accessibilityLabel="Try again"
      style={styles.action}
      onPress={() => void props.onRefresh()}
    >
      <Text style={[styles.retryText, { color: t.textPrimary }]}>Try again</Text>
    </Pressable>
  );

  if (props.threadLocked) {
    return (
      <View style={[styles.root, { backgroundColor: t.background }]}>
        <ArenaAtmosphere mood={atmosphereMood} energy={0.15} />
        <View style={[styles.top, styles.layer, { paddingTop: props.paddingTop }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={styles.backHit}
            onPress={props.onBack}
          >
            <BackIcon size={20} color={t.textPrimary} />
          </Pressable>
        </View>
        <View style={[styles.locked, styles.layer]}>
          <Text style={[styles.emptyTitle, { color: t.textPrimary }]}>Watch this Clash</Text>
          <Text style={[styles.emptyBody, { color: t.textSecondary }]}>
            {duel.status === 'open' && room.phase !== 'closed'
              ? 'Enter as a spectator to follow the Clash. Watching does not make you a fighter.'
              : 'This Clash is available to members.'}
          </Text>
          {duel.status === 'open' && room.phase !== 'closed' ? (
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Watch this Clash as a spectator"
              disabled={watching}
              style={[styles.primaryAction, { borderColor: t.borderStrong }]}
              onPress={() => {
                if (joining.current) return;
                hapticPress();
                joining.current = true;
                setWatching(true);
                setWatchError(false);
                void props
                  .onWatch()
                  .catch(() => setWatchError(true))
                  .finally(() => {
                    joining.current = false;
                    setWatching(false);
                  });
              }}
            >
              <Text style={[styles.primaryActionText, { color: t.textPrimary }]}>
                {watching ? 'Entering…' : 'Watch Clash'}
              </Text>
            </PressableScale>
          ) : null}
          {watchError ? (
            <Text accessibilityRole="alert" style={[styles.emptyBody, { color: t.textSecondary }]}>
              Couldn't enter this Clash.
            </Text>
          ) : null}
          {retry}
        </View>
        <DuelEntrance
          duel={duel}
          proposition={proposition}
          active={entrance}
          onDone={() => setEntrance(false)}
        />
      </View>
    );
  }

  if (props.loading && transcript.length === 0) {
    return (
      <View style={[styles.root, { backgroundColor: t.background }]}>
        <View style={[styles.top, { paddingTop: props.paddingTop }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={styles.backHit}
            onPress={props.onBack}
          >
            <BackIcon size={20} color={t.textPrimary} />
          </Pressable>
        </View>
        <View style={styles.locked}>
          <DuelLoadingBones />
        </View>
      </View>
    );
  }

  if (props.error && transcript.length === 0) {
    return (
      <View style={[styles.root, { backgroundColor: t.background }]}>
        <View style={[styles.top, { paddingTop: props.paddingTop }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={styles.backHit}
            onPress={props.onBack}
          >
            <BackIcon size={20} color={t.textPrimary} />
          </Pressable>
        </View>
        <View style={styles.locked}>
          <Text style={[styles.emptyTitle, { color: t.textPrimary }]}>
            Couldn't load the Clash.
          </Text>
          {retry}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: t.background }]}>
      <ArenaAtmosphere
        mood={atmosphereMood}
        energy={
          judgingFocus ? 0.08 : live ? 0.38 : atmosphereMood === 'verdict' ? 0.28 : 0.18
        }
      />

      <KeyboardAvoidingView
        style={[styles.root, styles.layer]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ImmersiveClash
          duel={duel}
          proposition={proposition}
          live={live}
          statusLabel={statusLabel}
          spectatorCount={crowd.context?.spectatorCount ?? null}
          crowd={crowd}
          onReportCrowd={props.onReportCrowd}
          focusSide={moment.side}
          latestMessage={moment.message}
          paddingTop={props.paddingTop}
          judgingFocus={judgingFocus || Boolean(duel.verdict)}
          condensed={keyboardOpen}
          backingSide={backingSide}
          onBackSide={(side) =>
            setBackingSide((prev) => (prev === side ? null : side))
          }
          canBack={canBack}
          onBack={props.onBack}
          onOpenProfile={props.onOpenProfile}
          onViewHistory={() => setHistoryOpen(true)}
          onMore={() => setMoreOpen(true)}
          roleLabel={presentation.role}
          crowdPaddingBottom={
            presentation.canPublish ? 0 : keyboardOpen ? space.xs : Math.max(props.paddingBottom, space.sm)
          }
          stageFooter={
            showOutcome ? (
              <View style={styles.outcome}>
                <DuelRoomOutcome
                  key={duel.clashId}
                  duel={duel}
                  phase={room.phase}
                  onJudge={props.onJudge}
                  onReview={() => setHistoryOpen(true)}
                  onReturn={props.onReturn}
                />
              </View>
            ) : null
          }
          fighterComposer={
            presentation.canPublish ? (
              <View
                style={{
                  paddingHorizontal: layout.screenX,
                  paddingBottom: Math.max(props.paddingBottom, space.sm),
                }}
              >
                {props.composer}
              </View>
            ) : null
          }
        />
      </KeyboardAvoidingView>

      <ArgumentHistorySheet
        visible={historyOpen}
        duel={duel}
        messages={transcript}
        onClose={() => setHistoryOpen(false)}
      />
      <ClashMoreSheet
        visible={moreOpen}
        onClose={() => setMoreOpen(false)}
        onArgumentHistory={() => setHistoryOpen(true)}
        onShare={() => {
          void Share.share({
            message: `CLASH — ${proposition}\n${duel.fighterA.name} vs ${duel.fighterB.name}`,
          }).catch(() => undefined);
        }}
        onReport={
          props.onReport
            ? () => {
                const target = moment.message;
                if (target) props.onReport?.(target);
              }
            : undefined
        }
      />

      <DuelDevPanel room={room} />
      <DuelEntrance
        duel={duel}
        proposition={proposition}
        active={entrance}
        onDone={() => setEntrance(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  layer: { zIndex: 1 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: layout.screenX,
    paddingBottom: space.xs,
    minHeight: 44,
  },
  backHit: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  locked: {
    flex: 1,
    paddingHorizontal: layout.screenX,
    paddingTop: space.xl,
    gap: space.sm,
  },
  emptyTitle: {
    ...typeScale.label,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  emptyBody: {
    ...typeScale.body,
    fontSize: 15,
    lineHeight: 22,
  },
  primaryAction: {
    minHeight: 44,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  primaryActionText: { ...typeScale.label, fontSize: 14, fontWeight: '700' },
  action: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: space.sm,
    paddingRight: space.sm,
  },
  retryText: { ...typeScale.label, fontSize: 14, fontWeight: '600' },
  bones: { gap: space.sm, width: '100%', paddingTop: space.md },
  boneLine: { height: 14, borderRadius: 6 },
  boneBlock: { height: 72, borderRadius: 8, marginVertical: space.xs },
  outcome: {
    paddingHorizontal: layout.screenX,
    paddingBottom: space.sm,
  },
});
