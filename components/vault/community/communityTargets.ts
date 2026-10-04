/**
 * Action targets for a community post or reply. Actions are derived from the
 * server payload's own permission flags (`canDelete`, `canModerate`) — the RPCs
 * re-authorize every write regardless.
 */

import type { CommunityPostCard, CommunityReplyCard } from '../../../services/vaultCommunityMappers';
import type { CommunityAction } from './CommunityActionSheet';

export type CommunityTarget =
  | { kind: 'post'; post: CommunityPostCard }
  | { kind: 'reply'; post: CommunityPostCard; reply: CommunityReplyCard };

export function communityTargetLabel(target: CommunityTarget): string {
  return target.kind === 'post' ? 'Community post' : 'Community reply';
}

/** The actions offered for a target, in display order. */
export function communityActionsFor(target: CommunityTarget): CommunityAction[] {
  const node = target.kind === 'post' ? target.post : target.reply;
  const actions: CommunityAction[] = [];

  if (node.canDelete) {
    actions.push({
      kind: 'delete',
      label: target.kind === 'post' ? 'Delete post' : 'Delete reply',
      destructive: true,
    });
  }
  if (target.kind === 'post' && node.canModerate) {
    actions.push({ kind: 'hide', label: 'Hide from community' });
  }
  actions.push({ kind: 'report', label: 'Report' });

  // Blocking needs a real identity; a pseudonymous author is report-only.
  if (!node.identity.pseudonymous && node.identity.profileId && !node.isMine) {
    actions.push({ kind: 'block', label: 'Block user', destructive: true });
  }
  return actions;
}
