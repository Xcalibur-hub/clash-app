/**
 * Full-screen live Clash canvas — one event, not stacked dashboard cards.
 * Stage (calm) + Crowd (live) blend through spacing/atmosphere, not card chrome.
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
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
  /** Real reaction burst on the newest Stage message, or null. */
  reactionBurst?: { emoji: string; key: string } | null;
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
}: ImmersiveClashProps): React.JSX.Element {
  const t = useThemeColors();
  const stageFlex = judgingFocus ? 0.72 : condensed ? 0.34 : 0.55;
  const reduced = useReducedMotion();
  const split = useSharedValue(stageFlex);
  React.useEffect(() => {
    // Phase changes (OPEN -> FINAL -> JUDGING) move the split instead of snapping.
    split.value = reduced
      ? stageFlex
      : withTiming(stageFlex, { duration: 280, easing: Easing.out(Easing.cubic) });
  }, [stageFlex, reduced, split]);
  const stageStyle = useAnimatedStyle(() => ({
    flexGrow: split.value,
    flexBasis: 0,
  }));
  const crowdStyle = useAnimatedStyle(() => ({
    flexGrow: 1 - split.value,
    flexBasis: 0,
  }));
  // The Crowd takes the remaining share of the same animated split.
  const compact = condensed || judgingFocus;

  return (
    <View style={styles.root} accessibilityLabel="Live Clash">
      <ClashEventHeader
        live={live}
        statusLabel={statusLabel}
        phaseLabel={phaseLabel}
        spectatorCount={spectatorCount}
        paddingTop={paddingTop}
        onBack={onBack}
        onMore={onMore}
      />

      <Animated.View style={[styles.stage, stageStyle]}>
        <ScrollView style={styles.stageScroll}
          contentContainerStyle={styles.stageContent} showsVerticalScrollIndicator={false}
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
              allowFontScaling={false}
              style={[styles.role, { color: t.textMuted }]}
            >
              {roleLabel}
            </Text>
            </View>
          ) : null}
          <ClashFighterRail
            duel={duel}
            focusSide={judgingFocus ? null : focusSide}
            condensed={compact}
            onOpenProfile={onOpenProfile}
          />
          {!judgingFocus ? (
            <CurrentArgumentStage
              duel={duel}
              focusSide={focusSide}
              message={latestMessage}
              condensed={compact}
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
        </ScrollView>
      </Animated.View>

      <Animated.View style={[styles.crowd, { borderTopColor: t.border }, crowdStyle]}>
        {reactionBurst ? (
          <ReactionBurst emoji={reactionBurst.emoji} burstKey={reactionBurst.key} />
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
    flexGrow: 1,
    gap: space.sm,
    paddingTop: space.xs,
  },
  crowd: { minHeight: 0, borderTopWidth: StyleSheet.hairlineWidth },
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
});
