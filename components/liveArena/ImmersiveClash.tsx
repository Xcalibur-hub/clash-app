/**
 * Full-screen live Clash canvas — one event, not stacked dashboard cards.
 * Stage (calm) + Crowd (live) blend through spacing/atmosphere, not card chrome.
 */
import React from 'react';
import { AccessibilityInfo, AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { isNewOfficialMoment, duelTimestamp } from '../../utils/duelPresentation';
import { tap as hapticTap } from '../../utils/haptics';
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
  DUEL_CROWD_COLLAPSED_HEADER_HEIGHT,
  DUEL_CROWD_MIN_HEIGHT,
  duelCrowdHeaderOnly,
  duelStageMode,
  duelStageShare,
} from '../../utils/duelStageLayout';
import { stageEntranceKey } from '../../utils/duelStageMotion';

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
  // Collapsed Crowd is header-only so SUPPORT / reactions / assist stay on the
  // first Stage screen on A50-class heights (Phase 3.6).
  const crowdHeaderOnly =
    crowdAvailable && duelCrowdHeaderOnly({ judging: judgingFocus, condensed, crowdExpanded });
  const reduced = useReducedMotion();
  const cursor = latestMessage ? {id:latestMessage.id,createdAt:latestMessage.createdAt,preciseCreatedAt:latestMessage.preciseCreatedAt,kind:latestMessage.kind} : null;
  const moment = React.useRef({ scope: viewerScope, message: cursor });
  const [arrivedId, setArrivedId] = React.useState<string | null>(null);
  const liveStage = live && !terminal;
  const entranceKey = stageEntranceKey(duel.clashId, viewerScope);
  React.useEffect(() => {
    if (moment.current.scope !== viewerScope) { moment.current = {scope:viewerScope,message:cursor}; setArrivedId(null); return; }
    if (!latestMessage) return;
    if (isNewOfficialMoment(moment.current.message, latestMessage)) {
      // Hydration sets the baseline without an arrival flash; only a newer live
      // official moment after that baseline earns emphasis + haptic.
      if (liveStage) {
        setArrivedId(latestMessage.id);
        if (AppState?.currentState === 'active') {
          if (!reduced) hapticTap();
          const speaker = focusSide === 'A' ? duel.fighterA : duel.fighterB;
          AccessibilityInfo?.announceForAccessibility?.('New official argument from ' + speaker.name + (duelTimestamp(latestMessage.createdAt) ? ' at ' + duelTimestamp(latestMessage.createdAt) : ''));
        }
      }
      moment.current.message = cursor;
    } else if (!moment.current.message) moment.current.message = cursor;
  }, [viewerScope, latestMessage, liveStage, reduced, focusSide, duel]);
  React.useEffect(() => {
    if (!arrivedId) return undefined;
    const clear = setTimeout(() => setArrivedId(current => (current === arrivedId ? null : current)), 1600);
    return () => clearTimeout(clear);
  }, [arrivedId]);
  const arrivalSide =
    arrivedId && latestMessage?.id === arrivedId && liveStage ? focusSide : null;
  const split = useSharedValue(stageFlex);
  React.useEffect(() => {
    // Phase changes (OPEN -> FINAL -> JUDGING) move the split instead of snapping.
    split.value = reduced
      ? stageFlex
      : withTiming(stageFlex, { duration: 280, easing: Easing.out(Easing.cubic) });
  }, [stageFlex, reduced, split]);
  const compactSummary = summaryMode;
  const stageStyle = useAnimatedStyle(() => ({
    // Header-only Crowd: Stage claims the remaining canvas (no 28% empty Crowd flex).
    flexGrow: compactSummary ? 0 : crowdHeaderOnly ? 1 : split.value,
    flexBasis: compactSummary ? 'auto' : 0,
    flexShrink: crowdHeaderOnly ? 1 : 0,
  }));
  const crowdStyle = useAnimatedStyle(() => ({
    flexGrow: compactSummary ? 1 : crowdHeaderOnly ? 0 : 1 - split.value,
    flexBasis: crowdHeaderOnly ? 'auto' : 0,
    flexShrink: 0,
  }));
  // The Crowd takes the remaining share of the same animated split.
  const compact = condensed || judgingFocus || crowdExpanded;
  const showPinnedSpectatorActions = !compactSummary;
  const showBackingActions = canBack && !judgingFocus && !condensed;
  // Plain View when Crowd is collapsed — Reanimated host dropped absolute height:48 on A50.
  const StageShell = crowdHeaderOnly ? View : Animated.View;

  return (
    <View style={styles.root} accessibilityLabel="Live Clash">
      <ClashEventHeader
        live={liveStage}
        statusLabel={statusLabel}
        phaseLabel={
          liveStage
            ? judgingFocus
              ? 'JUDGING'
              : phaseLabel
            : terminal === 'cancelled'
              ? 'CANCELLED'
              : terminal === 'settled'
                ? 'SETTLED'
                : undefined
        }
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
      ) : eventHint ? onViewResult ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View official result"
          onPress={onViewResult}
          style={styles.hintRow}
        >
          <Text style={[styles.hintText, { color: t.textPrimary }]}>{eventHint} View result →</Text>
        </Pressable>
      ) : (
        <Text accessibilityLiveRegion="polite" style={[styles.hintNote, { color: t.textSecondary }]}>
          {eventHint}
        </Text>
      ) : null}

      <StageShell
        style={[
          styles.stage,
          crowdHeaderOnly ? styles.stageWithCollapsedCrowd : stageStyle,
          compactSummary
            ? { height: DUEL_COMPACT_STAGE_HEIGHT, minHeight: DUEL_COMPACT_STAGE_HEIGHT, flexShrink: 0 }
            : null,
        ]}
      >
        {compact && latestMessage && !judgingFocus ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Read full current official argument"
            onPress={onViewHistory}
            style={styles.compactRead}
          >
            <Text style={[styles.compactReadText, { color: t.textPrimary }]}>Official argument · Read full →</Text>
          </Pressable>
        ) : null}
        {compact && !judgingFocus ? (
          <Animated.View entering={reduced ? undefined : FadeIn.duration(140)} style={styles.compactRail}>
            <ClashFighterRail
              duel={duel}
              focusSide={focusSide}
              condensed
              showPositions={false}
              backingSide={backingSide}
              onOpenProfile={onOpenProfile}
              live={liveStage}
              terminal={terminal}
              entranceKey={entranceKey}
              arrivalSide={arrivalSide}
            />
          </Animated.View>
        ) : (
          <>
            <ScrollView
              style={styles.stageScroll}
              contentContainerStyle={styles.stageContent}
              showsVerticalScrollIndicator
              keyboardShouldPersistTaps="handled"
              accessibilityLabel="Clash stage and official arguments"
            >
              <ClashProposition text={proposition} condensed={compact} />

              {(roleLabel || onToggleFollow) && !terminal ? (
                <View style={styles.metaRow}>
                  {roleLabel ? (
                    <View
                      style={[styles.roleChip, { backgroundColor: chipFill(t), borderColor: t.border }]}
                      accessible
                      accessibilityRole="text"
                      accessibilityLiveRegion="polite"
                      accessibilityLabel={'Your role: ' + roleLabel}
                    >
                      <Text style={[styles.role, { color: t.textMuted }]}>{roleLabel}</Text>
                    </View>
                  ) : <View style={styles.metaSpacer} />}
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
                </View>
              ) : null}
              {followError ? (
                <Text accessibilityRole="alert" style={[styles.followError, { color: t.textSecondary }]}>
                  {followError}
                </Text>
              ) : null}

              <ClashFighterRail
                duel={duel}
                focusSide={judgingFocus ? null : focusSide}
                condensed={false}
                backingSide={backingSide}
                onOpenProfile={onOpenProfile}
                live={liveStage}
                terminal={terminal}
                entranceKey={entranceKey}
                arrivalSide={arrivalSide}
              />
              {!judgingFocus ? (
                <CurrentArgumentStage
                  duel={duel}
                  focusSide={focusSide}
                  message={latestMessage}
                  condensed={compact}
                  highlighted={arrivedId === latestMessage?.id && liveStage}
                  onOpenFull={onViewHistory}
                />
              ) : null}
              {/* When pinned, actions sit outside the scroll so they stay tappable on A50. */}
              {!showPinnedSpectatorActions && showBackingActions ? (
                <ClashBackingActions
                  duel={duel}
                  backingSide={backingSide}
                  onBackSide={onBackSide}
                />
              ) : null}
              {!showPinnedSpectatorActions ? stageFooter : null}
            </ScrollView>
            {showPinnedSpectatorActions ? (
              <View
                style={[
                  styles.stageActions,
                  // Clear absolute Expand strip (style height below → ≥44dp a11y on A50).
                  crowdHeaderOnly ? { paddingBottom: 96 } : null,
                ]}
                accessibilityLabel={judgingFocus ? 'Official judging actions' : 'Spectator stage actions'}
              >
                {showBackingActions ? (
                  <ClashBackingActions
                    duel={duel}
                    backingSide={backingSide}
                    onBackSide={onBackSide}
                  />
                ) : null}
                {stageFooter}
              </View>
            ) : null}
            {crowdHeaderOnly ? (
              // Wrapper View owns the 48dp frame; Pressable fills it (ArenaButton/host pattern).
              <View
                collapsable={false}
                pointerEvents="box-none"
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 0,
                  // Style 80 → ≥44dp a11y on A50 (literal 48 ≈ content ~16dp under Stage flex).
                  // Target measured height ≈ DUEL_CROWD_COLLAPSED_HEADER_HEIGHT (48dp).
                  height: Math.max(80, DUEL_CROWD_COLLAPSED_HEADER_HEIGHT),
                  zIndex: 2,
                }}
              >
                <Pressable
                  collapsable={false}
                  accessibilityRole="button"
                  accessibilityLabel="Expand Crowd conversation"
                  accessibilityHint={
                    terminal
                      ? 'Gives the spectator Crowd more space. Conversation history.'
                      : 'Gives the spectator Crowd more space. Live conversation — tap Expand to read.'
                  }
                  accessibilityState={{ expanded: false }}
                  onPress={() => setCrowdExpanded(true)}
                  style={{
                    flex: 1,
                    minHeight: 48,
                    paddingHorizontal: 20,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    backgroundColor: t.surface,
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: t.border,
                  }}
                >
                  <View style={styles.crowdToggleCopy} pointerEvents="none">
                    <Text style={[styles.crowdToggleEyebrow, { color: t.textMuted }]}>SPECTATORS</Text>
                    <Text style={[styles.crowdToggleTitle, { color: t.textPrimary }]}>Crowd</Text>
                    <Text style={[styles.crowdToggleSub, { color: t.textMuted }]} numberOfLines={1}>
                      {terminal ? 'History · tap Expand' : 'Live · tap Expand to read'}
                    </Text>
                  </View>
                  <Text style={[styles.crowdToggleAction, { color: t.textSecondary }]} pointerEvents="none">
                    Expand
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </>
        )}
      </StageShell>

      {crowdAvailable && !crowdHeaderOnly ? (
          <Animated.View
            collapsable={false}
            style={[
              styles.crowd,
              {
                borderTopColor: t.border,
                backgroundColor: t.background,
                minHeight: DUEL_CROWD_MIN_HEIGHT,
              },
              crowdStyle,
            ]}
          >
            <Pressable
              collapsable={false}
              accessibilityRole="button"
              accessibilityLabel="Focus official Stage"
              accessibilityState={{ expanded: true }}
              accessibilityHint="Returns focus to the official Stage"
              onPress={() => setCrowdExpanded(false)}
              style={[
                styles.crowdToggle,
                { backgroundColor: t.surface, borderBottomColor: t.border },
              ]}
            >
              <View style={styles.crowdToggleCopy} pointerEvents="none">
                <Text style={[styles.crowdToggleEyebrow, { color: t.textMuted }]}>SPECTATORS</Text>
                <Text style={[styles.crowdToggleTitle, { color: t.textPrimary }]}>Crowd</Text>
                <Text style={[styles.crowdToggleSub, { color: t.textMuted }]}>
                  {terminal ? 'Conversation history' : 'Live conversation · separate from Stage'}
                </Text>
              </View>
              <Text style={[styles.crowdToggleAction, { color: t.textSecondary }]} pointerEvents="none">
                Focus Stage
              </Text>
            </Pressable>
            {reactionBurst && !terminal ? (
              // One visual per authoritative count increase; the payload never
              // exposes a tally, so no numeral is rendered.
              <ReactionBurst emoji={reactionBurst.emoji} burstKey={reactionBurst.key} count={1} />
            ) : null}
            <LiveCrowdLayer
              readOnly={Boolean(terminal) || duel.status !== 'open'}
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
    // visible so absolute Expand (48dp) is not clipped at the Stage edge on Android.
    overflow: 'visible',
  },
  /** Static flex when Crowd is header-only — guarantees dock keeps 48dp on Android. */
  stageWithCollapsedCrowd: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minHeight: 0,
  },
  stageScroll: { flex: 1, minHeight: 0 },
  stageContent: {
    gap: 10,
    paddingBottom: 10,
    paddingTop: space.xs,
  },
  /** Pinned below Stage scroll — SUPPORT / reactions / assist / judging stay tappable. */
  stageActions: {
    flexShrink: 0,
    gap: 6,
    paddingBottom: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'transparent',
  },
  crowd: { flexShrink: 0, borderTopWidth: StyleSheet.hairlineWidth },
  crowdToggle: {
    minHeight: 52,
    maxHeight: 72,
    paddingHorizontal: 20,
    paddingVertical: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  crowdToggleCopy: { flex: 1, minWidth: 0, gap: 0 },
  crowdToggleEyebrow: { fontSize: 9, fontWeight: '800', letterSpacing: 1.1, lineHeight: 11 },
  crowdToggleTitle: { fontSize: 14, fontWeight: '700', letterSpacing: 0.15, lineHeight: 17 },
  crowdToggleSub: { fontSize: 11, fontWeight: '500', lineHeight: 14 },
  crowdToggleAction: { fontSize: 12, fontWeight: '700', flexShrink: 0 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 16,
    minHeight: 44,
  },
  metaSpacer: { flex: 1 },
  follow: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
  },
  followText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  followError: { alignSelf: 'flex-end', fontSize: 12, lineHeight: 16, paddingHorizontal: 16 },
  roleChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  role: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  composer: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  terminalRow: {
    minHeight: 44,
    paddingHorizontal: 16,
    justifyContent: 'center',
    gap: 2,
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
  hintRow: {
    minHeight: 44,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  hintText: { fontSize: 13, fontWeight: '600' },
  hintNote: {
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  compactRead: {
    minHeight: 44,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  compactReadText: { fontSize: 13, fontWeight: '600' },
  compactRail: { paddingBottom: 8, minHeight: 56, flexShrink: 0 },
});
