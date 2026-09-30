import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ClashMode } from '../../services/clashEngineService';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';

export interface ClashModeSheetProps {
  visible: boolean;
  onClose: () => void;
  onChoose: (mode: ClashMode) => void;
}

const SIDE_A = '#A580FF';
const SIDE_B = '#3D8BFF';

/** Compact Standard vs Blind picker — frames THIS TAKE vs CHALLENGER. */
export function ClashModeSheet({ visible, onClose, onChoose }: ClashModeSheetProps): React.JSX.Element | null {
  const t = useThemeColors();
  const insets = useSafeAreaInsets();
  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.scrim, { backgroundColor: t.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: t.surfaceElevated,
              borderColor: t.border,
              marginBottom: Math.max(insets.bottom, space.lg),
            },
          ]}
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
            onPress={() => {
              hapticTap();
              onChoose('STANDARD');
            }}
            accessibilityRole="button"
            accessibilityLabel="Standard Clash"
            style={[styles.option, { borderColor: t.border, backgroundColor: t.surface }]}
          >
            <Text allowFontScaling={false} style={[styles.optionTitle, { color: t.textPrimary }]}>
              Standard Clash
            </Text>
            <Text allowFontScaling={false} style={[styles.optionBody, { color: t.textMuted }]}>
              Identities are visible while judging.
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              hapticTap();
              onChoose('BLIND');
            }}
            accessibilityRole="button"
            accessibilityLabel="Blind Clash. Participants stay hidden until you judge."
            style={[styles.option, { borderColor: t.border, backgroundColor: t.surface }]}
          >
            <Text allowFontScaling={false} style={[styles.optionTitle, { color: t.textPrimary }]}>
              Blind Clash
            </Text>
            <Text allowFontScaling={false} style={[styles.optionBody, { color: t.textMuted }]}>
              Participants stay hidden until you judge.
            </Text>
          </Pressable>
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
  },
  optionTitle: { ...typeScale.label, fontWeight: '700' },
  optionBody: { ...typeScale.meta, fontSize: 12 },
});
