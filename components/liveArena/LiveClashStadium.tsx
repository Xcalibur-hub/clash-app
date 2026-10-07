/**
 * Stadium architecture: Stage (top ~50–60%) + Live Stream / Crowd (bottom ~40–50%).
 * Ratio flexes for judging, keyboard, and small screens — conceptual split preserved.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { ArenaDuel } from '../../utils/arenaDuelPayload';
import type { ArenaMessage } from '../../services/liveArenaService';
import { ClashStage } from './ClashStage';
import { CrowdStreamShell } from './CrowdStreamShell';

export interface LiveClashStadiumProps {
  duel: ArenaDuel;
  proposition: string;
  live: boolean;
  statusLabel: string;
  spectatorCount: number | null;
  argumentA: ArenaMessage | null;
  argumentB: ArenaMessage | null;
  /** Judging / verdict: shrink Crowd, keep Stage authoritative. */
  judgingFocus?: boolean;
  /** Keyboard / compact Stage row. */
  condensed?: boolean;
  backingSide: 'A' | 'B' | null;
  onBackSide: (side: 'A' | 'B') => void;
  canBack: boolean;
  onOpenProfile?: (id: string) => void;
  onViewHistory: () => void;
  onMore: () => void;
  roleLabel?: string;
  crowdPaddingBottom?: number;
  stageFooter?: React.ReactNode;
}

export function LiveClashStadium({
  duel,
  proposition,
  live,
  statusLabel,
  spectatorCount,
  argumentA,
  argumentB,
  judgingFocus = false,
  condensed = false,
  backingSide,
  onBackSide,
  canBack,
  onOpenProfile,
  onViewHistory,
  onMore,
  roleLabel,
  crowdPaddingBottom = 0,
  stageFooter,
}: LiveClashStadiumProps): React.JSX.Element {
  const stageFlex = judgingFocus ? 0.72 : condensed ? 0.4 : 0.58;
  const crowdFlex = judgingFocus ? 0.28 : condensed ? 0.6 : 0.42;

  return (
    <View style={styles.root} accessibilityLabel="Live Clash stadium">
      <View style={[styles.stageZone, { flex: stageFlex }]}>
        <ClashStage
          duel={duel}
          proposition={proposition}
          live={live}
          statusLabel={statusLabel}
          spectatorCount={spectatorCount}
          argumentA={argumentA}
          argumentB={argumentB}
          condensed={condensed || judgingFocus}
          backingSide={backingSide}
          onBackSide={onBackSide}
          canBack={canBack && !judgingFocus}
          onOpenProfile={onOpenProfile}
          onViewHistory={onViewHistory}
          onMore={onMore}
          roleLabel={roleLabel}
        />
        {stageFooter}
      </View>
      <View style={[styles.crowdZone, { flex: crowdFlex }]}>
        <CrowdStreamShell
          subdued={judgingFocus}
          paddingBottom={crowdPaddingBottom}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  stageZone: { minHeight: 0 },
  crowdZone: { minHeight: 0 },
});
