/**
 * Standard vs Blind Clash picker.
 *
 * Always surfaces feedback: pressed → submitting → success (caller closes)
 * or inline error + retry. Never unmounts itself mid-submit.
 */
import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ClashMode } from '../../services/clashEngineService';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';

export interface ClashModeSheetProps {
  visible: boolean;
  onClose: () => void;
  onChoose: (mode: ClashMode) => void;
  /** Blocks mode buttons and dismiss while an RPC is in flight. */
  submitting?: boolean;
  /** Inline human-readable error; keep sheet open on failure. */
  error?: string | null;
}

const SIDE_A = '#A580FF';
const SIDE_B = '#3D8BFF';

export function ClashModeSheet({
  visible,
  onClose,
  onChoose,
  submitting = false,
  error = null,
}: ClashModeSheetProps): React.JSX.Element {
  const t = useThemeColors();
  const insets = useSafeAreaInsets();

  const choose = (mode: ClashMode): void => {
    if (submitting) return;
    hapticTap();
    onChoose(mode);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!submitting) onClose();
      }}
    >
      <View style={[styles.scrim, { backgroundColor: t.overlay }]}>
        {/* Dismiss target — sits behind the sheet; sheet captures its own touches. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => {
            if (!submitting) onClose();
          }}
          accessibilityLabel="Close"
          disabled={submitting}
        />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: t.surfaceElevated,
              borderColor: t.border,
              marginBottom: Math.max(insets.bottom, space.lg),
            },
          ]}
          // Claim the sheet hit region so the dismiss Pressable cannot steal taps
          // from Standard / Blind on Android.
          onStartShouldSetResponder={() => true}
          accessibilityViewIsModal
        >
          <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
            Start a Clash
          </Text>

          <View style={styles.versus}>
            <View style={[styles.sideChip, { backgroundColor: 'rgba(165,128,255,0.14)', borderColor: SIDE_A }]}>
              <Text allowFontScaling={false} style={[styles.sideLabel, { color: SIDE_A }]}>
                SIDE A
              </Text>
              <Text allowFontScaling={false} style={[styles.sideBody, { color: t.textPrimary }]}>
                This Take
              </Text>
            </View>
            <Text allowFontScaling={false} style={[styles.vs, { color: t.textMuted }]}>
              VS
            </Text>
            <View style={[styles.sideChip, { backgroundColor: 'rgba(61,139,255,0.14)', borderColor: SIDE_B }]}>
              <Text allowFontScaling={false} style={[styles.sideLabel, { color: SIDE_B }]}>
                SIDE B
              </Text>
              <Text allowFontScaling={false} style={[styles.sideBody, { color: t.textPrimary }]}>
                Challenger
              </Text>
            </View>
          </View>

          <Pressable
            onPress={() => choose('STANDARD')}
            disabled={submitting}
            accessibilityRole="button"
            accessibilityLabel="Standard Clash"
            accessibilityState={{ busy: submitting, disabled: submitting }}
            style={({ pressed }) => [
              styles.option,
              {
                borderColor: t.border,
                backgroundColor: t.surface,
                opacity: submitting ? 0.55 : pressed ? 0.88 : 1,
              },
            ]}
          >
            <Text allowFontScaling={false} style={[styles.optionTitle, { color: t.textPrimary }]}>
              Standard Clash
            </Text>
            <Text allowFontScaling={false} style={[styles.optionBody, { color: t.textMuted }]}>
              Identities are visible while judging.
            </Text>
          </Pressable>

          <Pressable
            onPress={() => choose('BLIND')}
            disabled={submitting}
            accessibilityRole="button"
            accessibilityLabel="Blind Clash. Participants stay hidden until you judge."
            accessibilityState={{ busy: submitting, disabled: submitting }}
            style={({ pressed }) => [
              styles.option,
              {
                borderColor: t.border,
                backgroundColor: t.surface,
                opacity: submitting ? 0.55 : pressed ? 0.88 : 1,
              },
            ]}
          >
            <Text allowFontScaling={false} style={[styles.optionTitle, { color: t.textPrimary }]}>
              Blind Clash
            </Text>
            <Text allowFontScaling={false} style={[styles.optionBody, { color: t.textMuted }]}>
              Participants stay hidden until you judge.
            </Text>
          </Pressable>

          {submitting ? (
            <View style={styles.statusRow} accessibilityLiveRegion="polite">
              <ActivityIndicator size="small" color={t.textPrimary} />
              <Text allowFontScaling={false} style={[styles.statusText, { color: t.textSecondary }]}>
                Starting Clash…
              </Text>
            </View>
          ) : null}

          {error && !submitting ? (
            <Text
              allowFontScaling={false}
              style={[styles.error, { color: t.danger, backgroundColor: t.surfaceMuted }]}
              accessibilityLiveRegion="assertive"
              accessibilityRole="alert"
            >
              {error}
            </Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  sheet: {
    marginHorizontal: space.md,
    padding: space.lg,
    gap: space.sm,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    zIndex: 2,
    elevation: 8,
  },
  title: { ...typeScale.label, fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  versus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.xs,
  },
  sideChip: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1.5,
    padding: space.sm,
    gap: 2,
  },
  sideLabel: {
    ...typeScale.caption,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  sideBody: { ...typeScale.label, fontSize: 13, fontWeight: '700' },
  vs: { ...typeScale.caption, fontWeight: '800', letterSpacing: 0.4 },
  option: {
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
    minHeight: 64,
    justifyContent: 'center',
  },
  optionTitle: { ...typeScale.label, fontWeight: '700' },
  optionBody: { ...typeScale.meta, fontSize: 12 },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.xs,
  },
  statusText: { ...typeScale.meta, fontWeight: '600' },
  error: {
    ...typeScale.meta,
    fontWeight: '600',
    padding: space.sm,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
});
