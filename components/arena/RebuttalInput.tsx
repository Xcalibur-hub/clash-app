import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { createComment, showNotice, useClash } from '../../store';
import { useRequireAuth } from '../../hooks/useRequireAuth';
import { postComment } from '../../services/apiService';
import { errorText } from '../../services/supabaseClient';
import { ink, typeScale } from '../../theme';
import { press as hapticPress } from '../../utils/haptics';

const MAX = 180;

export interface RebuttalInputProps {
  takeId: string;
  /** Parent rebuttal id when replying inside a thread. */
  parentId?: string;
  /** Human handle being replied to, for the composer label. */
  replyingTo?: string;
  onDone?: () => void;
}

/** Bottom input bar: draft rebuttal/reply + count + send. */
export function RebuttalInput({ takeId, parentId, replyingTo, onDone }: RebuttalInputProps): React.JSX.Element {
  const { dispatch } = useClash();
  const requireAuth = useRequireAuth();
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

  return (
    <View style={styles.wrap}>
      {replyingTo ? (
        <View style={styles.replyRow}>
          <Text allowFontScaling={false} style={styles.replyLabel}>
            Replying to @{replyingTo}
          </Text>
          <Pressable onPress={onDone} accessibilityRole="button" accessibilityLabel="Cancel reply" hitSlop={8}>
            <Text allowFontScaling={false} style={styles.cancel}>
              Cancel
            </Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.row}>
        <TextInput
          value={draft}
          onChangeText={(t) => setDraft(t.slice(0, MAX))}
          placeholder={parentId ? 'Reply…' : 'Drop your rebuttal...'}
          placeholderTextColor="rgba(247,247,250,0.38)"
          style={styles.input}
          accessibilityLabel={parentId ? 'Reply to rebuttal' : 'Drop your rebuttal'}
        />
        <Text allowFontScaling={false} style={styles.count}>{`${MAX - draft.length}`}</Text>
        <Pressable
          onPress={() => {
            void submit();
          }}
          disabled={!draft.trim() || pending}
          accessibilityRole="button"
          accessibilityLabel={parentId ? 'Send reply' : 'Send rebuttal'}
          style={[styles.send, (!draft.trim() || pending) && styles.off]}
        >
          <Text allowFontScaling={false} style={styles.sendText}>
            {pending ? 'Sending' : 'Submit'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  replyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  replyLabel: { ...typeScale.meta, fontSize: 12, color: ink.tertiary },
  cancel: { ...typeScale.meta, fontSize: 12, color: ink.secondary, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1, ...typeScale.body, fontSize: 14, color: ink.primary, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.05)' },
  count: { ...typeScale.data, fontSize: 10, color: ink.tertiary },
  send: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: ink.primary },
  off: { opacity: 0.4 },
  sendText: { fontSize: 13, fontWeight: '800', color: ink.inverse },
});
