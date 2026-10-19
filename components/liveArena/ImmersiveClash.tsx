/**
 * Full-screen live Clash canvas — one event, not stacked dashboard cards.
 * Stage (calm) + Crowd (live) blend through spacing/atmosphere, not card chrome.
 */
import React from 'react';
import { AccessibilityInfo, AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { isNewOfficialMoment, duelTimestamp } from '../../utils/duelPresentation';
import { tap as hapticTap } from '../../utils/haptics';
import { arena } from '../../theme/arena';
import { chipFill } from './liveArenaStyles';
import { ReactionBurst } from './ReactionBurst';
import type { ArenaDuel } from '../../utils/arenaDuelPayload';
import type { ArenaMessage } from '../../services/liveArenaService';
import { ClashEventHeader } from './ClashEventHeader';
import { ClashProposition } from './ClashProposition';
import { ClashFighterRail } from './ClashFighterRail';
import { CurrentArgumentStage } from './CurrentArgumentStage';
import { ClashBackingActions } from './ClashBackingActions';
import { LiveCrowdLayer, type LiveCrowdLayerProps } from './LiveCrowdLayer';
import { space, typeScale, useThemeColors } from '../../theme';
import {
  DUEL_COMPACT_STAGE_HEIGHT,
  duelStageMode,
  duelStageShare,
} from '../../utils/duelStageLayout';

export interface ImmersiveClashProps {
  duel: ArenaDuel;
  proposition: string;
  live: boolean;
  statusLabel: string;
  phaseLabel?: string;
  spectatorCount: number | null;
  focusSide: 'A' | 'B' | null;
  latestMessage: ArenaMessage | null;
  paddingTop: number;
  judgingFocus?: boolean;
  viewerScope?: string;
  eventHint?: string;
  onViewResult?: () => void;
  condensed?: boolean;
  backingSide: 'A' | 'B' | null;
  onBackSide: (side: 'A' | 'B') => void;
  canBack: boolean;
  onBack: () => void;
  onOpenProfile?: (id: string) => void;
  onViewHistory: () => void;
  onMore: () => void;
  roleLabel?: string;
  crowdPaddingBottom?: number;
  stageFooter?: React.ReactNode;
  fighterComposer?: React.ReactNode;
  crowd?: LiveCrowdLayerProps['crowd'];
  crowdUnavailableReason?: string;
  onReportCrowd?: LiveCrowdLayerProps['onReport'];
  /** Step 4A: Follow control. Omitted when following is unavailable. */
  following?: boolean;
  followBusy?: boolean;
  followError?: string | null;
  onToggleFollow?: () => void;
  /** Real reaction burst on the newest Stage message, or null. */
  reactionBurst?: { emoji: string; key: string } | null;
  /** Terminal states drop live chrome: RESULT for settled, CLOSED for cancelled. */
  terminal?: 'settled' | 'cancelled' | null;
}

export function ImmersiveClash({
  duel,
  proposition,
  live,
  statusLabel,
  phaseLabel,
  spectatorCount,
  focusSide,
  latestMessage,
  paddingTop,
  judgingFocus = false,
  viewerScope = duel.clashId,
  eventHint,
  onViewResult,
  condensed = false,
  backingSide,
  onBackSide,
  canBack,
  onBack,
  onOpenProfile,
  onViewHistory,
  onMore,
  roleLabel,
  crowdPaddingBottom = 0,
  stageFooter,
  fighterComposer,
  crowd,
  crowdUnavailableReason,
  onReportCrowd,
  reactionBurst = null,
  terminal = null,
  following = false,
  followBusy = false,
  followError = null,
  onToggleFollow,
}: ImmersiveClashProps): React.JSX.Element {
  const t = useThemeColors();
  const [crowdExpanded, setCrowdExpanded] = React.useState(false);
  const stageMode = duelStageMode({ judging: judgingFocus, condensed, crowdExpanded });
  // A cancelled Clash has no Crowd, so the Stage takes the whole canvas.
  const crowdAvailable = terminal !== 'cancelled';
  const stageFlex = crowdAvailable ? duelStageShare(stageMode) : 1;
  const summaryMode = crowdAvailable && (stageMode === 'condensed' || stageMode === 'crowdExpanded');
  const reduced = useReducedMotion();
  const cursor = latestMessage ? {id:latestMessage.id,createdAt:latestMessage.createdAt,preciseCreatedAt:latestMessage.preciseCreatedAt,kind:latestMessage.kind} : null;
  const moment = React.useRef({ scope: viewerScope, message: cursor });
  const [arrivedId, setArrivedId] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (moment.current.scope !== viewerScope) { moment.current = {scope:viewerScope,message:cursor}; setArrivedId(null); return; }
    if (!latestMessage) return;
    if (isNewOfficialMoment(moment.current.message, latestMessage)) {
      if (live) {
        setArrivedId(latestMessage.id);
        if (AppState?.currentState === 'active') {
          if (!reduced) hapticTap();
          const speaker = focusSide === 'A' ? duel.fighterA : duel.fighterB;
          AccessibilityInfo?.announceForAccessibility?.('New official argument from ' + speaker.name + (duelTimestamp(latestMessage.createdAt) ? ' at ' + duelTimestamp(latestMessage.createdAt) : ''));
        }
      }
      moment.current.message = cursor;
    } else if (!moment.current.message) moment.current.message = cursor;
  }, [viewerScope, latestMessage, live, reduced, focusSide, duel]);
  const split = useSharedValue(stageFlex);
  React.useEffect(() => {
    // Phase changes (OPEN -> FINAL -> JUDGING) move the split instead of snapping.
    split.value = reduced
      ? stageFlex
      : withTiming(stageFlex, { duration: 280, easing: Easing.out(Easing.cubic) });
  }, [stageFlex, reduced, split]);
  const compactSummary = summaryMode;
  const stageStyle = useAnimatedStyle(() => ({
    flexGrow: compactSummary ? 0 : split.value,
    flexBasis: compactSummary ? 'auto' : 0,
  }));
  const crowdStyle = useAnimatedStyle(() => ({
    flexGrow: compactSummary ? 1 : 1 - split.value,
    flexBasis: 0,
  }));
  // The Crowd takes the remaining share of the same animated split.
  const compact = condensed || judgingFocus || crowdExpanded;

  return (
    <View style={styles.root} accessibilityLabel="Live Clash">
      <ClashEventHeader
        live={live && !terminal}
        statusLabel={statusLabel}
        phaseLabel={phaseLabel}
        spectatorCount={spectatorCount}
        paddingTop={paddingTop}
        onBack={onBack}
        onMore={onMore}
      />

      {terminal === 'settled' ? (
        onViewResult ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="View official result"
            onPress={onViewResult}
            style={styles.terminalRow}
          >
            <Text style={[styles.terminalText, { color: t.textPrimary }]}>Official result · View verdict →</Text>
          </Pressable>
        ) : (
          <View style={styles.terminalRow}>
            <Text style={[styles.terminalText, { color: t.textPrimary }]}>Official result.</Text>
          </View>
        )
      ) : terminal === 'cancelled' ? (
        <View style={styles.terminalRow} accessibilityLiveRegion="polite">
          <Text style={[styles.terminalText, { color: t.textPrimary }]}>Room closed — no verdict.</Text>
          <Text style={[styles.terminalNote, { color: t.textSecondary }]}>
            {crowdUnavailableReason ?? 'Crowd chat is unavailable for this Clash.'}
          </Text>
        </View>
      ) : eventHint ? onViewResult ? <Pressable accessibilityRole="button" accessibilityLabel="View official result" onPress={onViewResult} style={{minHeight:44,paddingHorizontal:16,justifyContent:'center'}}><Text style={{color:t.textPrimary,fontSize:13}}>{eventHint} View result →</Text></Pressable> : <Text accessibilityLiveRegion="polite" style={{color:t.textSecondary,fontSize:12,lineHeight:17,paddingHorizontal:16,paddingBottom:6}}>{eventHint}</Text> : null}
      <Animated.View style={[styles.stage, stageStyle, compactSummary ? { height: DUEL_COMPACT_STAGE_HEIGHT, minHeight: DUEL_COMPACT_STAGE_HEIGHT, flexShrink: 0 } : null]}>
        {compact && latestMessage && !judgingFocus ? <Pressable accessibilityRole="button" accessibilityLabel="Read full current official argument" onPress={onViewHistory} style={{minHeight:44,paddingHorizontal:16,justifyContent:'center'}}><Text style={{color:t.textPrimary,fontSize:13,fontWeight:'600'}}>Official argument · Read full →</Text></Pressable> : null}
        {compact && !judgingFocus ? <View style={{paddingBottom:8,minHeight:56,flexShrink:0}}><ClashFighterRail duel={duel} focusSide={focusSide} condensed showPositions={false} onOpenProfile={onOpenProfile} /></View> : <ScrollView style={styles.stageScroll}
          contentContainerStyle={styles.stageContent} showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled"
          accessibilityLabel="Clash stage and official arguments">
          <ClashProposition text={proposition} condensed={compact} />
          {roleLabel ? (
            <View
              style={[styles.roleChip, { backgroundColor: chipFill(t), borderColor: t.border }]}
              accessible
              accessibilityRole="text"
              accessibilityLiveRegion="polite"
              accessibilityLabel={'Your role: ' + roleLabel}
            >
            <Text
              style={[styles.role, { color: t.textMuted }]}
            >
              {roleLabel}
            </Text>
            </View>
          ) : null}
          {onToggleFollow ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={following ? 'Following this Clash. Stop following' : 'Follow this Clash'}
              accessibilityState={{ selected: following, busy: followBusy }}
              disabled={followBusy}
              onPress={onToggleFollow}
              style={[
                styles.follow,
                {
                  borderColor: following ? t.borderStrong : t.border,
                  backgroundColor: following ? chipFill(t) : 'transparent',
                  opacity: followBusy ? 0.55 : 1,
                },
              ]}
            >
              <Text
                allowFontScaling={false}
                style={[styles.followText, { color: following ? t.textPrimary : t.textSecondary }]}
              >
                {followBusy ? 'SAVING…' : following ? 'FOLLOWING' : 'FOLLOW'}
              </Text>
            </Pressable>
          ) : null}
          {followError ? (
            <Text accessibilityRole="alert" style={[styles.followError, { color: t.textSecondary }]}>
              {followError}
            </Text>
          ) : null}
          <ClashFighterRail
            duel={duel}
            focusSide={judgingFocus ? null : focusSide}
            condensed
            onOpenProfile={onOpenProfile}
          />
          {!judgingFocus ? (
            <CurrentArgumentStage
              duel={duel}
              focusSide={focusSide}
              message={latestMessage}
              condensed={compact}
              highlighted={arrivedId === latestMessage?.id}
              onOpenFull={onViewHistory}
            />
          ) : null}
          {canBack && !judgingFocus && !condensed ? (
            <ClashBackingActions
              duel={duel}
              backingSide={backingSide}
              onBackSide={onBackSide}
            />
          ) : null}
          {stageFooter}
        </ScrollView>}
      </Animated.View>

      {crowdAvailable ? (
      <Animated.View style={[styles.crowd, { borderTopColor: t.border }, crowdStyle]}>
        <Pressable accessibilityRole="button" accessibilityLabel={crowdExpanded ? 'Focus official Stage' : 'Expand Crowd conversation'} accessibilityState={{ expanded: crowdExpanded }} onPress={() => setCrowdExpanded(value => !value)} style={{ minHeight: 44, paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: t.surface }}><Text style={{ color: t.textPrimary, fontSize: 13, fontWeight: '600' }}>Crowd conversation</Text><Text style={{ color: t.textSecondary, fontSize: 12 }}>{crowdExpanded ? 'Focus Stage' : 'Expand chat'}</Text></Pressable>
        {reactionBurst && !terminal ? (
          // One visual per authoritative count increase; the payload never
          // exposes a tally, so no numeral is rendered.
          <ReactionBurst emoji={reactionBurst.emoji} burstKey={reactionBurst.key} count={1} />
        ) : null}
        <LiveCrowdLayer
          unavailableReason={crowdUnavailableReason}
          key={crowd?.identityVersion ?? 0}
          crowd={crowd}
          onReport={onReportCrowd}
          subdued={judgingFocus}
          paddingBottom={crowdPaddingBottom}
        />
      </Animated.View>
      ) : null}

      {fighterComposer ? (
        <View style={[styles.composer, { borderTopColor: t.border }]}>
          {fighterComposer}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  stage: {
    minHeight: 0,
    overflow: 'hidden',
  },
  stageScroll: { flex: 1 },
  stageContent: {
    gap: 8,
    paddingBottom: 12,
    paddingTop: space.xs,
  },
  crowd: { minHeight: 134, flexShrink: 0, borderTopWidth: StyleSheet.hairlineWidth },
  follow: {
    alignSelf: 'flex-end',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
  },
  followText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  followError: { alignSelf: 'flex-end', fontSize: 12, lineHeight: 16 },
  roleChip: {
    alignSelf: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  role: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
    textAlign: 'center',
  },
  composer: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  terminalRow: {
    minHeight: 44,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  terminalText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  terminalNote: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '400',
  },
});
