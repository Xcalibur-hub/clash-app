import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import type { CommunityPostCard, CommunityReplyCard } from '../../../services/vaultCommunityMappers';
import { createCommunityReply, fetchCommunityReplies } from '../../../services/vaultCommunityService';
import { errorText } from '../../../services/supabaseClient';
import { showNotice, useClash } from '../../../store';
import { space, typeScale, useThemeColors } from '../../../theme';
import { tap as hapticTap } from '../../../utils/haptics';
import { CommunityComposer } from './CommunityComposer';
import { CommunityPostCard as PostCard } from './CommunityPostCard';
import { CommunityReplyList } from './CommunityReplyList';
import type { CommunityTarget } from './communityTargets';

export interface CommunityThreadProps {
  post: CommunityPostCard;
  expanded: boolean;
  pseudonymEnabled: boolean;
  pseudonym: string | null;
  realName: string;
  onToggleExpanded: () => void;
  onMore: (target: CommunityTarget) => void;
  onOpenProfile?: (profileId: string) => void;
}

/** One discussion post plus its (one-level) replies and reply composer. */
export function CommunityThread({
  post,
  expanded,
  pseudonymEnabled,
  pseudonym,
  realName,
  onToggleExpanded,
  onMore,
  onOpenProfile,
}: CommunityThreadProps): React.JSX.Element {
  const { dispatch } = useClash();
  const t = useThemeColors();
  const [replies, setReplies] = React.useState<CommunityReplyCard[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [composerOpen, setComposerOpen] = React.useState(false);
  const [replyTo, setReplyTo] = React.useState<CommunityReplyCard | null>(null);
  const [busy, setBusy] = React.useState(false);

  const loadReplies = React.useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      setReplies(await fetchCommunityReplies(post.id));
    } catch (error) {
      dispatch(showNotice(errorText(error)));
    } finally {
      setLoading(false);
    }
  }, [post.id, dispatch]);

  React.useEffect(() => {
    if (expanded && replies === null) void loadReplies();
  }, [expanded, replies, loadReplies]);

  const submitReply = async (input: { body: string; pseudonymous: boolean }): Promise<void> => {
    setBusy(true);
    try {
      await createCommunityReply({
        postId: post.id,
        parentReplyId: replyTo?.id ?? null,
        body: input.body,
        pseudonymous: input.pseudonymous,
      });
      await loadReplies();
      setComposerOpen(false);
      setReplyTo(null);
    } catch (error) {
      dispatch(showNotice(errorText(error)));
    } finally {
      setBusy(false);
    }
  };

  const count = replies ? Math.max(post.replyCount, replies.length) : post.replyCount;
  const openProfile = (profileId: string | null): void => {
    if (profileId && onOpenProfile) onOpenProfile(profileId);
  };

  return (
    <PostCard
      post={{ ...post, replyCount: count }}
      onToggleReplies={() => {
        hapticTap();
        onToggleExpanded();
        if (!expanded) {
          setReplyTo(null);
          setComposerOpen(true);
        }
      }}
      onMore={() => onMore({ kind: 'post', post })}
      onOpenProfile={() => openProfile(post.identity.profileId)}
    >
      {expanded ? (
        <>
          <CommunityReplyList
            replies={replies ?? []}
            loading={loading}
            onReply={(reply) => {
              setReplyTo(reply);
              setComposerOpen(true);
            }}
            onMore={(reply) => onMore({ kind: 'reply', post, reply })}
            onOpenProfile={(reply) => openProfile(reply.identity.profileId)}
          />
          {composerOpen ? (
            <CommunityComposer
              compact
              realName={realName}
              pseudonymEnabled={pseudonymEnabled}
              pseudonym={pseudonym}
              busy={busy}
              placeholder={replyTo ? `Reply to ${replyTo.identity.name}…` : 'Add a reply…'}
              onSubmit={(input) => void submitReply(input)}
            />
          ) : (
            <Pressable
              onPress={() => {
                hapticTap();
                setReplyTo(null);
                setComposerOpen(true);
              }}
              style={styles.replyCta}
              accessibilityRole="button"
              accessibilityLabel="Add a reply"
            >
              <Text allowFontScaling={false} style={[styles.replyCtaLabel, { color: t.textSecondary }]}>
                Add a reply
              </Text>
            </Pressable>
          )}
        </>
      ) : null}
    </PostCard>
  );
}

const styles = StyleSheet.create({
  replyCta: { paddingVertical: space.xs },
  replyCtaLabel: { ...typeScale.label, fontSize: 13, fontWeight: '700' },
});
