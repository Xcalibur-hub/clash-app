/**
 * Rotating live argument excerpts for the active Today's Arena card.
 * Real server snippets only — never invented debate text.
 */
import React from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutUp,
  useReducedMotion,
} from 'react-native-reanimated';
import type { LiveArgumentExcerpt, LiveReactionSignal } from '../../services/liveArenaService';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { withAlpha } from '../../utils/color';

const ROTATE_MS_MIN = 4500;
const ROTATE_MS_MAX = 6500;

export interface LiveArgumentPreviewProps {
  excerpts: readonly LiveArgumentExcerpt[];
  signals?: readonly LiveReactionSignal[];
  /** Pause rotation when false (off-screen / inactive). */
  active: boolean;
  emptyLabel?: string;
  /** Optional fleeting burst text from a newly arrived message. */
  burstText?: string | null;
}

export function LiveArgumentPreview({
  excerpts,
  signals = [],
  active,
  emptyLabel = 'Be the first argument.',
  burstText = null,
}: LiveArgumentPreviewProps): React.JSX.Element {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const [index, setIndex] = React.useState(0);
  const [appActive, setAppActive] = React.useState(AppState.currentState === 'active');

  React.useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      setAppActive(next === 'active');
    });
    return () => sub.remove();
  }, []);

  const excerptKey = excerpts.map((e) => e.id).join('|');

  React.useEffect(() => {
    setIndex(0);
  }, [excerptKey]);

  React.useEffect(() => {
    if (reduced || !active || !appActive || excerpts.length < 2) return;
    const delay = ROTATE_MS_MIN + Math.floor(Math.random() * (ROTATE_MS_MAX - ROTATE_MS_MIN));
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % excerpts.length);
    }, delay);
    return () => clearInterval(timer);
  }, [active, appActive, excerpts.length, reduced]);

  const primary = excerpts[index] ?? null;
  const secondary =
    excerpts.length >= 2 ? excerpts[(index + 1) % excerpts.length]! : null;

  return (
    <View style={styles.wrap} accessibilityRole="text">
      {burstText ? (
        <Animated.View
          entering={reduced ? undefined : FadeIn.duration(220)}
          exiting={reduced ? undefined : FadeOut.duration(280)}
          style={[styles.burst, { backgroundColor: withAlpha(t.textPrimary, 0.06) }]}
        >
          <Text allowFontScaling={false} numberOfLines={2} style={[styles.burstText, { color: t.textPrimary }]}>
            {burstText}
          </Text>
        </Animated.View>
      ) : null}

      {!primary ? (
        <Text allowFontScaling={false} style={[styles.empty, { color: t.textMuted }]}>
          {emptyLabel}
        </Text>
      ) : (
        <View style={styles.pair}>
          <ExcerptBlock
            key={primary.id}
            excerpt={primary}
            edgeColor={withAlpha('#7CB87C', 0.85)}
            animate={!reduced && active}
          />
          {secondary ? (
            <>
              <Text allowFontScaling={false} style={[styles.vs, { color: t.textMuted }]}>
                ⚔
              </Text>
              <ExcerptBlock
                key={secondary.id}
                excerpt={secondary}
                edgeColor={withAlpha('#E07A6B', 0.85)}
                animate={!reduced && active}
              />
            </>
          ) : null}
        </View>
      )}

      {signals.length > 0 ? (
        <View style={styles.signals}>
          {signals.slice(0, 2).map((s) => (
            <Text
              key={s.emoji}
              allowFontScaling={false}
              style={[styles.signal, { color: t.textSecondary }]}
            >
              {s.emoji} × {s.count}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function ExcerptBlock({
  excerpt,
  edgeColor,
  animate,
}: {
  excerpt: LiveArgumentExcerpt;
  edgeColor: string;
  animate: boolean;
}): React.JSX.Element {
  const t = useThemeColors();
  const body =
    excerpt.text.trim().length > 0
      ? `“${excerpt.text.trim()}”`
      : excerpt.kind === 'gif'
        ? 'GIF reply'
        : '…';

  return (
    <Animated.View
      entering={animate ? SlideInDown.duration(320).easing(Easing.out(Easing.cubic)) : undefined}
      exiting={animate ? SlideOutUp.duration(240) : undefined}
      style={styles.excerpt}
    >
      <View style={[styles.edge, { backgroundColor: edgeColor }]} />
      <View style={styles.excerptBody}>
        <Text allowFontScaling={false} numberOfLines={3} style={[styles.quote, { color: t.textPrimary }]}>
          {body}
        </Text>
        <Text allowFontScaling={false} style={[styles.handle, { color: t.textMuted }]}>
          @{excerpt.handle}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: space.sm,
    minHeight: 72,
  },
  pair: {
    gap: space.xs,
  },
  excerpt: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  edge: {
    width: 3,
    borderRadius: radius.pill,
    alignSelf: 'stretch',
    minHeight: 28,
    marginTop: 2,
  },
  excerptBody: {
    flex: 1,
    gap: 2,
  },
  quote: {
    ...typeScale.body,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
    letterSpacing: -0.15,
  },
  handle: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '600',
    alignSelf: 'flex-end',
  },
  vs: {
    fontSize: 12,
    textAlign: 'center',
    opacity: 0.55,
    marginVertical: 2,
  },
  empty: {
    ...typeScale.body,
    fontSize: 13,
    fontStyle: 'italic',
    fontWeight: '500',
  },
  burst: {
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  burstText: {
    ...typeScale.caption,
    fontSize: 12,
    fontWeight: '700',
  },
  signals: {
    flexDirection: 'row',
    gap: 10,
  },
  signal: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '700',
  },
});
