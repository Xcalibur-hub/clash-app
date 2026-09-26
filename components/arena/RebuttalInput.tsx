import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { createComment, showNotice, useClash } from '../../store';
import { postComment } from '../../services/apiService';
import { errorText } from '../../services/supabaseClient';
import { ink, typeScale } from '../../theme';
import { press as hapticPress } from '../../utils/haptics';

const MAX = 180;

/** Bottom input bar: draft rebuttal + count + send. Max 150 lines. */
export function RebuttalInput({ takeId }: { takeId: string }): React.JSX.Element {
  const { state, dispatch } = useClash();
  const [draft, setDraft] = React.useState('');
  const [pending, setPending] = React.useState(false);

  async function submit(): Promise<void> {
    const text = draft.trim();
    if (!text || pending) return;
    hapticPress();
    setPending(true);
    try {
      const comment = await postComment(takeId, text.slice(0, MAX), state.viewer.id);
      dispatch(createComment(comment));
      setDraft('');
    } catch (error) {
      dispatch(showNotice(errorText(error)));
    } finally {
      setPending(false);
    }
  }

  return (
    <View style={styles.row}>
      <TextInput
        value={draft}
        onChangeText={(t) => setDraft(t.slice(0, MAX))}
        placeholder="Drop your rebuttal..."
        placeholderTextColor="rgba(247,247,250,0.38)"
        style={styles.input}
        accessibilityLabel="Drop your rebuttal"
      />
      <Text allowFontScaling={false} style={styles.count}>{`${MAX - draft.length}`}</Text>
      <Pressable
        onPress={() => {
          void submit();
        }}
        disabled={!draft.trim() || pending}
        accessibilityRole="button"
        accessibilityLabel="Send rebuttal"
        style={[styles.send, (!draft.trim() || pending) && styles.off]}
      >
        <Text allowFontScaling={false} style={styles.sendText}>
          {pending ? 'Sending' : 'Submit'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1, ...typeScale.body, fontSize: 14, color: ink.primary, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.05)' },
  count: { ...typeScale.data, fontSize: 10, color: ink.tertiary },
  send: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: ink.primary },
  off: { opacity: 0.4 },
  sendText: { fontSize: 13, fontWeight: '800', color: ink.inverse },
});
