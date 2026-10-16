import React from 'react';
import { GroupDiscovery } from './groups/GroupDiscovery';
export interface ArenaCommunityProps {
  onParticipate?: () => void;
  refreshToken?: number;
}
/** Embedded in the existing Arena scroll surface; keeps Crew services and routes. */
export function ArenaCommunity(props: ArenaCommunityProps): React.JSX.Element {
  return <GroupDiscovery {...props} />;
}
