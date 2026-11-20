/**
 * @deprecated Prefer ImmersiveClash — thin adapter for any stale imports.
 */
import React from 'react';
import type { ArenaDuel } from '../../utils/arenaDuelPayload';
import type { ArenaMessage } from '../../services/liveArenaService';
import { ImmersiveClash } from './ImmersiveClash';

export interface LiveClashStadiumProps {
  duel: ArenaDuel;
  proposition: string;
  live: boolean;
  statusLabel: string;
  spectatorCount: number | null;
  argumentA: ArenaMessage | null;
  argumentB: ArenaMessage | null;
  judgingFocus?: boolean;
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
  paddingTop?: number;
  onBack?: () => void;
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
  crowdPaddingBottom = 0,
  stageFooter,
  paddingTop = 0,
  onBack = () => undefined,
}: LiveClashStadiumProps): React.JSX.Element {
  const aAt = argumentA?.createdAt ?? -1;
  const bAt = argumentB?.createdAt ?? -1;
  const focusSide =
    aAt < 0 && bAt < 0 ? null : aAt >= bAt ? ('A' as const) : ('B' as const);
  const latestMessage =
    focusSide === 'A' ? argumentA : focusSide === 'B' ? argumentB : null;

  return (
    <ImmersiveClash
      duel={duel}
      proposition={proposition}
      live={live}
      statusLabel={statusLabel}
      spectatorCount={spectatorCount}
      focusSide={focusSide}
      latestMessage={latestMessage}
      paddingTop={paddingTop}
      judgingFocus={judgingFocus}
      condensed={condensed}
      backingSide={backingSide}
      onBackSide={onBackSide}
      canBack={canBack}
      onBack={onBack}
      onOpenProfile={onOpenProfile}
      onViewHistory={onViewHistory}
      onMore={onMore}
      crowdPaddingBottom={crowdPaddingBottom}
      stageFooter={stageFooter}
    />
  );
}
