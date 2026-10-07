/**
 * Full-screen live Clash canvas — one event, not stacked dashboard cards.
 * Stage (calm) + Crowd (live) blend through spacing/atmosphere, not card chrome.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ArenaDuel } from '../../utils/arenaDuelPayload';
import type { ArenaMessage } from '../../services/liveArenaService';
import { ClashEventHeader } from './ClashEventHeader';
import { ClashProposition } from './ClashProposition';
import { ClashFighterRail } from './ClashFighterRail';
import { CurrentArgumentStage } from './CurrentArgumentStage';
import { ClashBackingActions } from './ClashBackingActions';
import { LiveCrowdLayer } from './LiveCrowdLayer';
import { space, typeScale, useThemeColors } from '../../theme';

export interface ImmersiveClashProps {
  duel: ArenaDuel;
  proposition: string;
  live: boolean;
  statusLabel: string;
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
}

export function ImmersiveClash({
  duel,
  proposition,
  live,
  statusLabel,
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
}: ImmersiveClashProps): React.JSX.Element {
  const t = useThemeColors();
  const stageFlex = judgingFocus ? 0.78 : condensed ? 0.42 : 0.58;
  const crowdFlex = judgingFocus ? 0.22 : condensed ? 0.58 : 0.42;
  const compact = condensed || judgingFocus;

  return (
    <View style={styles.root} accessibilityLabel="Live Clash">
      <ClashEventHeader
        live={live}
        statusLabel={statusLabel}
        spectatorCount={spectatorCount}
        paddingTop={paddingTop}
        onBack={onBack}
        onMore={onMore}
      />

      <View style={[styles.stage, { flex: stageFlex }]}>
        <ClashProposition text={proposition} condensed={compact} />
        {roleLabel ? (
          <Text
            allowFontScaling={false}
            style={[styles.role, { color: t.textMuted }]}
            accessibilityLiveRegion="polite"
          >
            {roleLabel}
          </Text>
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
      </View>

      <View style={[styles.crowd, { flex: crowdFlex }]}>
        <LiveCrowdLayer
          subdued={judgingFocus}
          paddingBottom={crowdPaddingBottom}
        />
      </View>

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
    gap: space.sm,
    paddingTop: space.xs,
  },
  crowd: { minHeight: 0 },
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
