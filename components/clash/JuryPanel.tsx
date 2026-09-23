import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import type { Juror } from '../../store';
import { calculateResult } from '../../services/juryService';
import { duel, ink, radius, space, typeScale } from '../../theme';
import { Avatar } from '../shared/Avatar';
import { sideTone } from './duelPalette';

export interface JuryPanelProps {
  jurors: readonly Juror[];
  /** False until the viewer files a ballot — the tally must stay sealed (§8). */
  reveal: boolean;
}

/**
 * The 9-person jury (spec §9). Jurors are shown as sealed avatars until the
 * reveal, when each ballot is stamped on its avatar and the tally is summed from
 * the jury itself — the panel never takes a score from anywhere else.
 */
export function JuryPanel({ jurors, reveal }: JuryPanelProps): React.JSX.Element {
  const summary = React.useMemo(() => (reveal ? calculateResult(jurors) : null), [jurors, reveal]);

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text allowFontScaling={false} style={styles.eyebrow}>
          {`${jurors.length}-PERSON JURY`}
        </Text>
        <Text
          allowFontScaling={false}
          style={styles.score}
          accessibilityLabel={
            summary
              ? `Jury verdict: ${summary.score.a} for take A, ${summary.score.b} for take B`
              : 'Jury verdict sealed until you vote'
          }
        >
          {summary ? `${summary.score.a} — ${summary.score.b}` : '–  –'}
        </Text>
      </View>

      <View style={styles.jurors}>
        {jurors.map((juror, index) => {
          const tone = sideTone(juror.vote).tone;
          return (
            <View
              key={juror.id}
              style={[styles.slot, summary ? { borderColor: tone, borderWidth: 1.5 } : null]}
            >
              <Avatar name={juror.handle} tint={summary ? juror.tint : '#3A3A44'} size={30} />
              {summary ? (
                <Animated.View
                  entering={ZoomIn.delay(index * 45).duration(220)}
                  style={[styles.vote, { backgroundColor: tone }]}
                >
                  <Text allowFontScaling={false} style={styles.voteText}>
                    {juror.vote}
                  </Text>
                </Animated.View>
              ) : null}
            </View>
          );
        })}
      </View>

      {summary ? (
        <Animated.View entering={FadeIn.duration(260)} style={styles.sealed}>
          <View style={styles.bar}>
            <View style={[styles.segment, { flex: summary.score.a, backgroundColor: duel.a }]} />
            <View style={[styles.segment, { flex: summary.score.b, backgroundColor: duel.b }]} />
          </View>
          <Text allowFontScaling={false} style={styles.caption}>
            {`${summary.score.a} of ${summary.size} backed Take A · ${summary.verdict}`}
          </Text>
        </Animated.View>
      ) : (
        <Text allowFontScaling={false} style={styles.hint}>
          Jurors vote independently and see neither your ballot nor the tally until it closes.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  eyebrow: { ...typeScale.caption, color: ink.tertiary },
  score: { ...typeScale.dataLg, color: ink.primary },
  jurors: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm + 2 },
  slot: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 2,
  },
  vote: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 15,
    height: 15,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#08080B',
  },
  voteText: { ...typeScale.caption, fontSize: 9, letterSpacing: 0, color: '#08080B' },
  sealed: { gap: space.sm },
  bar: {
    flexDirection: 'row',
    height: 6,
    borderRadius: radius.pill,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  segment: { height: 6 },
  hint: { ...typeScale.meta, color: ink.quaternary },
  caption: { ...typeScale.meta, color: ink.tertiary },
});
