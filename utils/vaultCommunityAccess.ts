/**
 * Community access presentation (Phase 15.2).
 *
 * These helpers only LABEL and COMPOSE copy — access itself is always decided
 * server-side (`vault_community_viewer_can_access`). Nothing here grants entry.
 */

export type CommunityAccessType = 'public' | 'followers' | 'subscribers';

/** The compact pill shown in the community header and chapter card. */
export function communityAccessLabel(access: CommunityAccessType | string): string {
  switch (access) {
    case 'followers':
      return 'Followers';
    case 'subscribers':
      return 'Subscribers';
    default:
      return 'Public';
  }
}

/** One short sentence describing who may enter. */
export function communityAccessRule(access: CommunityAccessType | string): string {
  switch (access) {
    case 'followers':
      return 'Open to followers of this creator.';
    case 'subscribers':
      return 'Open to active subscribers.';
    default:
      return 'Open to anyone signed in.';
  }
}

export interface CommunityGateInput {
  access: CommunityAccessType | string;
  signedIn: boolean;
  following: boolean;
  subscribed: boolean;
  creatorName: string;
}

export type CommunityGateAction = 'signin' | 'follow' | 'subscribe' | 'enter';

export interface CommunityGateCopy {
  title: string;
  body: string;
  action: CommunityGateAction;
  actionLabel: string;
}

/**
 * The gate a viewer sees before entering. `enter` is returned only when the
 * server has already granted access, so the UI never offers a stale action.
 */
export function communityGateCopy(input: CommunityGateInput): CommunityGateCopy {
  const name = input.creatorName.trim() || 'this creator';
  if (!input.signedIn) {
    return {
      title: 'Sign in to enter',
      body: 'Communities are members-only spaces inside this world.',
      action: 'signin',
      actionLabel: 'Sign in',
    };
  }
  if (input.access === 'subscribers' && !input.subscribed) {
    return {
      title: 'Subscribers only',
      body: `Enter ${name}'s community by subscribing.`,
      action: 'subscribe',
      actionLabel: 'Subscribe to enter',
    };
  }
  if (input.access === 'followers' && !input.following) {
    return {
      title: 'Followers only',
      body: `Follow ${name} to join their community.`,
      action: 'follow',
      actionLabel: 'Follow to enter',
    };
  }
  return {
    title: 'Join the conversation',
    body: `Step inside ${name}'s community.`,
    action: 'enter',
    actionLabel: 'Enter',
  };
}
