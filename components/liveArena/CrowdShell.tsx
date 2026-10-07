/**
 * Crowd shell — thin re-export of CrowdStreamShell for existing smoke/tests.
 * Prefer CrowdStreamShell in Stadium layouts.
 */
import React from 'react';
import { CrowdStreamShell } from './CrowdStreamShell';

export function CrowdShell(): React.JSX.Element {
  return <CrowdStreamShell />;
}
