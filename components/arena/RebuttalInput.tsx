import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { createComment, showNotice, useClash } from '../../store';
import { useRequireAuth } from '../../hooks/useRequireAuth';
import { postComment } from '../../services/apiService';
import { errorText } from '../../services/supabaseClient';
import { radius, typeScale, useThemeColors } from '../../theme';
import { press as hapticPress } from '../../utils/haptics';

const MAX = 180;

export interface RebuttalInputProps {
  takeId: string;
  parentId?: string;
  replyingTo?: string;
  onDone?: () => void;
}

/** Compact conversation composer — theme-aware, not a large form. */
export function RebuttalInput({ takeId, parentId, replyingTo, onDone }: RebuttalInputProps): React.JSX.Element {
  const { dispatch } = useClash();
  const requireAuth = useRequireAuth();
  const t = useThemeColors();
  const [draft, setDraft] = React.useState('');
  const [pending, setPending] = React.useState(false);

  async function submit(): Promise<void> {
    const text = draft.trim();
    if (!text || pending) return;
    if (!requireAuth()) return;
    hapticPress();
    setPending(true);
    try {
      const comment = await postComment(takeId, text.slice(0, MAX), parentId);
      dispatch(createComment(comment));
      setDraft('');
      onDone?.();
    } catch (error) {
      dispatch(showNotice(errorText(error)));
    } finally {
      setPending(false);
    }
  }

  const canSend = Boolean(draft.trim()) && !pending;

  return (
    <View style={styles.wrap}>
      {replyingTo ? (
        <View style={styles.replyRow}>
          <Text allowFontScaling={false} style={[styles.replyLabel, { color: t.textMuted }]}>
            Replying to @{replyingTo}
          </Text>
          <Pressable onPress={onDone} accessibilityRole="button" accessibilityLabel="Cancel reply" hitSlop={8}>
            <Text allowFontScaling={false} style={[styles.cancel, { color: t.textSecondary }]}>
              Cancel
            </Text>
          </Pressable>
        </View>
      ) : null}
      <View
        style={[
          styles.row,
          {
            backgroundColor: t.inputBackground,
            borderColor: t.border,
          },
        ]}
      >
        <TextInput
          value={draft}
          onChangeText={(next) => setDraft(next.slice(0, MAX))}
          placeholder={parentId ? 'Reply…' : 'Add to the conversation…'}
          placeholderTextColor={t.textMuted}
          style={[styles.input, { color: t.textPrimary }]}
          accessibilityLabel={parentId ? 'Reply to rebuttal' : 'Add to the conversation'}
        />
        <Text allowFontScaling={false} style={[styles.count, { color: t.textMuted }]}>
          {MAX - draft.length}
        </Text>
        <Pressable
          onPress={() => {
            void submit();
          }}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel={parentId ? 'Send reply' : 'Send'}
          style={[styles.send, { backgroundColor: t.clashFill }, !canSend && styles.off]}
        >
          <Text allowFontScaling={false} style={[styles.sendText, { color: t.clashText }]}>
            {pending ? '…' : '↑'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  replyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  replyLabel: { ...typeScale.meta, fontSize: 12 },
  cancel: { ...typeScale.meta, fontSize: 12, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 6,
    minHeight: 48,
  },
  input: {
    flex: 1,
    ...typeScale.body,
    fontSize: 15,
    paddingVertical: 8,
  },
  count: { ...typeScale.data, fontSize: 10 },
  send: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  off: { opacity: 0.35 },
  sendText: { fontSize: 16, fontWeight: '800', lineHeight: 18 },
});
