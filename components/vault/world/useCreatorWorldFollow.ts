import React from 'react';
import { followUser, unfollowUser } from '../../../services/socialService';
import type { CreatorWorldData } from './creatorWorldLoader';

/** One scoped follow operation; no side effects inside React state updaters. */
export function useCreatorWorldFollow(creatorId: string, scope: string, data: CreatorWorldData | null, canFollow: boolean) {
  const [change, setChange] = React.useState<{ source: CreatorWorldData; following: boolean } | null>(null);
  const [busyScope, setBusyScope] = React.useState<string | null>(null);
  const [errorScope, setErrorScope] = React.useState<string | null>(null);
  const owner = React.useRef<object | null>(null), currentScope = React.useRef(scope);
  currentScope.current = scope;
  React.useEffect(() => {
    setChange(null); setBusyScope(null); setErrorScope(null);
    return () => { owner.current = null; };
  }, [scope]);
  const following = change?.source === data ? change.following : data?.follow?.following ?? false;
  const toggleFollow = React.useCallback(() => {
    if (!canFollow || !data?.follow || owner.current) return;
    const ticket = {}; owner.current = ticket; setBusyScope(scope); setErrorScope(null);
    setChange({ source: data, following: !following });
    void (following ? unfollowUser(creatorId) : followUser(creatorId)).catch(() => {
      if (owner.current === ticket && currentScope.current === scope) {
        setChange({ source: data, following }); setErrorScope(scope);
      }
    }).finally(() => {
      if (owner.current === ticket && currentScope.current === scope) { owner.current = null; setBusyScope(null); }
    });
  }, [canFollow, data, scope, following, creatorId]);
  return { following, toggleFollow, busy: busyScope === scope, error: errorScope === scope };
}
