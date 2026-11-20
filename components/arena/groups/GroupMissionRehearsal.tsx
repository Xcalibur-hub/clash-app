import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from '../../../theme';
import { GroupButton } from './GroupButton';

const choices = [
  'Repeat the claim more confidently.',
  'Ask for a comparable before-and-after measurement.',
  'Count how many people agree with the claim.',
];

/** No services, rewards or persistence: this is a personal, local rehearsal. */
export function GroupMissionRehearsal(): React.JSX.Element {
  const t = useThemeColors();
  const [started, setStarted] = React.useState(false);
  const [choice, setChoice] = React.useState<number | null>(null);
  const [submitted, setSubmitted] = React.useState(false);
  const success = submitted && choice === 1;
  const reset = () => { setChoice(null); setSubmitted(false); };
  return <View style={[styles.card, { backgroundColor: t.surfaceElevated, borderColor: t.border }]}>
    <Text style={[styles.eyebrow, { color: t.textMuted }]}>LOCAL DEMO · COMMUNITY MISSION</Text>
    <Text accessibilityRole="header" style={[styles.title, { color: t.textPrimary }]}>Build a stronger argument</Text>
    <Text style={[styles.body, { color: t.textSecondary }]}>Practice one useful contribution: choose the evidence that would help a community evaluate a claim.</Text>
    <Text style={[styles.body, { color: t.textMuted }]}>Your local progress: {success ? '1' : '0'}/1. No shared score, saved progress or rewards.</Text>
    {!started ? <GroupButton label="Try local mission" onPress={() => setStarted(true)} /> : <>
      <Text style={[styles.body, { color: t.textPrimary }]}>Claim: “Our new study method saves time.” Which next step best tests it?</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="Choose an evidence check" style={styles.choices}>
        {choices.map((label, index) => <Pressable key={label} accessibilityRole="radio" accessibilityLabel={label}
          accessibilityState={{ checked: choice === index, disabled: submitted }} disabled={submitted}
          onPress={() => setChoice(index)} style={[styles.choice, { borderColor: choice === index ? t.textPrimary : t.border }]}>
          <Text style={[styles.body, { color: t.textPrimary }]}>{choice === index ? '● ' : '○ '}{label}</Text>
        </Pressable>)}
      </View>
      {!submitted ? <GroupButton label="Check local answer" disabled={choice === null} onPress={() => setSubmitted(true)} /> : <>
        <Text accessibilityLiveRegion="polite" style={[styles.body, { color: t.textPrimary }]}>
          {success ? 'Mission complete locally. Comparable measurements test the claim instead of its popularity.' : 'Not yet. Confidence and popularity are not measurements. Try checking evidence under comparable conditions.'}
        </Text>
        <GroupButton secondary label={success ? 'Replay local mission' : 'Try again locally'} onPress={reset} />
      </>}
      <GroupButton secondary label="Close local mission" onPress={() => { reset(); setStarted(false); }} />
    </>}
  </View>;
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, padding: 18, gap: 14 },
  eyebrow: { fontSize: 11, lineHeight: 17, fontWeight: '600', letterSpacing: 1 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  body: { fontSize: 14, lineHeight: 22, flexShrink: 1 },
  choices: { gap: 10 },
  choice: { minHeight: 48, borderWidth: 1, borderRadius: 12, padding: 14, justifyContent: 'center' },
});
