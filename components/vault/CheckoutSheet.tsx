import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { GlassCard } from '../shared/GlassCard';
import { GlowButton } from '../shared/GlowButton';
import { Chip } from '../shared/Chip';
import { LockIcon, ReceiptIcon, ShieldCheckIcon } from '../shared/icons';
import { accent, duration, ink, radius } from '../../theme';
import { checkout, paySheet, sheet } from './vaultStyles';
import { PAY_METHODS, confirmPayment, createPayment, type PayMethod } from '../../services/vaultService';
import type { Drop } from '../../store/types';
import { judge as hapticJudge, notify as hapticNotify, tap as hapticTap } from '../../utils/haptics';

export type CheckoutStage = 'methods' | 'paying' | 'done';

export interface CheckoutSheetProps {
  drop: Drop | null;
  onClose: () => void;
  onUnlocked: (dropId: string) => void;
}

/** Simulated UPI checkout (§19): method → PAY → ✓ UNLOCKED. Mock only. */
export function CheckoutSheet({ drop, onClose, onUnlocked }: CheckoutSheetProps): React.JSX.Element | null {
  const [method, setMethod] = React.useState<PayMethod>('upi');
  const [stage, setStage] = React.useState<CheckoutStage>('methods');

  React.useEffect(() => {
    if (drop) {
      setMethod('upi');
      setStage('methods');
    }
  }, [drop]);

  const pay = React.useCallback(async (): Promise<void> => {
    if (!drop || stage !== 'methods') return;
    hapticJudge();
    setStage('paying');
    const receipt = await confirmPayment(createPayment(drop, method));
    hapticNotify('success');
    setStage('done');
    setTimeout(() => onUnlocked(receipt.dropId), 650);
  }, [drop, method, onUnlocked, stage]);

  if (!drop) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(duration.fast)} style={sheet.scrim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close checkout" />
        <Animated.View entering={FadeInUp.duration(duration.base)} style={sheet.box}>
          <GlassCard level="strong" corner={radius.xxl} contentStyle={paySheet.card}>
            {stage === 'done' ? (
              <DoneBody title={drop.title} />
            ) : (
              <PayBody drop={drop} method={method} stage={stage} onMethod={setMethod} onPay={() => { void pay(); }} />
            )}
          </GlassCard>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

function DoneBody({ title }: { title: string }): React.JSX.Element {
  return (
    <View style={checkout.done}>
      <View style={checkout.tick}>
        <ShieldCheckIcon size={30} color={accent.mint} strokeWidth={2.4} />
      </View>
      <Text allowFontScaling={false} style={checkout.doneTitle}>Unlocked</Text>
      <Text allowFontScaling={false} style={checkout.doneBody}>
        {title} is yours. Mock receipt saved — no real money moved.
      </Text>
    </View>
  );
}

function PayBody({ drop, method, stage, onMethod, onPay }: {
  drop: Drop; method: PayMethod; stage: CheckoutStage;
  onMethod: (next: PayMethod) => void; onPay: () => void;
}): React.JSX.Element {
  return (
    <View style={paySheet.card}>
      <View style={checkout.head}>
        <LockIcon size={16} color={ink.secondary} strokeWidth={2.4} />
        <Text allowFontScaling={false} style={checkout.title}>Unlock for ₹{drop.price}</Text>
      </View>
      <Text allowFontScaling={false} style={checkout.dropTitle} numberOfLines={2}>{drop.title}</Text>
      <View style={checkout.methods}>
        {PAY_METHODS.map((entry) => {
          const active = entry.id === method;
          return (
            <Pressable
              key={entry.id}
              onPress={() => { hapticTap(); onMethod(entry.id); }}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={entry.label}
              style={[checkout.method, active && checkout.methodActive]}
            >
              <Text allowFontScaling={false} style={[checkout.methodLabel, active && checkout.on]}>
                {entry.label}
              </Text>
              <Text allowFontScaling={false} style={checkout.hint}>{entry.hint}</Text>
            </Pressable>
          );
        })}
      </View>
      <GlowButton
        label={stage === 'paying' ? 'Confirming…' : `Pay ₹${drop.price}`}
        onPress={onPay}
        icon={ReceiptIcon}
        tone="light"
        disabled={stage === 'paying'}
      />
      <View style={checkout.mockRow}>
        <Chip label="MOCK CHECKOUT" tone="neutral" />
        <Text allowFontScaling={false} style={checkout.mockText}>Simulated UPI — provider later.</Text>
      </View>
    </View>
  );
}
