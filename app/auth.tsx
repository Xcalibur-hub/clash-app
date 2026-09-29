import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../store/AuthProvider';
import { accent, card, color, ink, layout, radius, space, typeScale } from '../theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Hosted Supabase may deliver 6–10 digit numeric email OTPs. */
const OTP_MIN_LENGTH = 6;
const OTP_MAX_LENGTH = 10;

function normalizeOtp(value: string): string {
  return value.replace(/\D/g, '').slice(0, OTP_MAX_LENGTH);
}

function isOtpComplete(value: string): boolean {
  return value.length >= OTP_MIN_LENGTH && value.length <= OTP_MAX_LENGTH;
}

/** Email OTP sign-in. Minimal and flat — no gradients, no glow, no glass. */
export default function AuthScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signedIn, requestOtp, verifyOtp } = useAuth();

  const [step, setStep] = React.useState<'email' | 'code'>('email');
  const [email, setEmail] = React.useState('');
  const [code, setCode] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const emailValid = EMAIL_RE.test(email.trim());
  const codeValid = isOtpComplete(code);

  // Once a session lands, return to wherever the user came from.
  React.useEffect(() => {
    if (!signedIn) return;
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, [signedIn, router]);

  const close = (): void => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const sendCode = async (): Promise<void> => {
    if (!emailValid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await requestOtp(email.trim());
      setStep('code');
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (): Promise<void> => {
    if (!codeValid || busy) return;
    setBusy(true);
    setError(null);
    try {
      // Pass the full numeric token unchanged — do not truncate to 6.
      await verifyOtp(email.trim(), code);
      // `signedIn` flips and the effect above routes away.
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.lg },
      ]}
    >
      <View style={styles.head}>
        <Text allowFontScaling={false} style={styles.wordmark}>
          CLASH
        </Text>
        <Text allowFontScaling={false} style={styles.sub}>
          {step === 'email'
            ? 'Sign in to make your take.'
            : `Enter the verification code we sent to ${email.trim()}.`}
        </Text>
      </View>

      <View style={styles.card}>
        {step === 'email' ? (
          <>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={ink.quaternary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
              style={styles.input}
              accessibilityLabel="Email address"
            />
            <PrimaryButton label="Continue" onPress={() => void sendCode()} disabled={!emailValid || busy} />
            <Text allowFontScaling={false} style={styles.hint}>
              We will email you a one-time code. No password.
            </Text>
          </>
        ) : (
          <>
            <TextInput
              value={code}
              onChangeText={(text) => setCode(normalizeOtp(text))}
              placeholder="Code"
              placeholderTextColor={ink.quaternary}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              maxLength={OTP_MAX_LENGTH}
              style={[styles.input, styles.code]}
              accessibilityLabel="Verification code"
            />
            <PrimaryButton label="Verify" onPress={() => void confirm()} disabled={!codeValid || busy} />
            <View style={styles.codeRow}>
              <TextButton label="Resend code" onPress={() => void sendCode()} disabled={busy} />
              <TextButton
                label="Use a different email"
                onPress={() => {
                  setCode('');
                  setStep('email');
                }}
              />
            </View>
          </>
        )}

        {error ? (
          <Text allowFontScaling={false} style={styles.error}>
            {error}
          </Text>
        ) : null}
      </View>

      <View style={styles.footer}>
        <TextButton label="Continue browsing" onPress={close} />
      </View>
    </View>
  );
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Try again.';
}

function PrimaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={[styles.primary, disabled && styles.primaryDisabled]}
    >
      <Text allowFontScaling={false} style={styles.primaryText}>
        {label}
      </Text>
    </Pressable>
  );
}

function TextButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" style={styles.textButton}>
      <Text allowFontScaling={false} style={styles.textButtonLabel}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg, paddingHorizontal: layout.screenX },
  head: { gap: space.sm, marginTop: space.xl },
  wordmark: { ...typeScale.display, fontSize: 40, lineHeight: 48, letterSpacing: 8, color: ink.primary },
  sub: { ...typeScale.body, color: ink.secondary },
  card: {
    marginTop: space.xl,
    backgroundColor: card.solid,
    borderWidth: 1,
    borderColor: card.border,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
  },
  input: {
    ...typeScale.body,
    color: ink.primary,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 14,
  },
  code: { textAlign: 'center', letterSpacing: 8, fontSize: 22 },
  hint: { ...typeScale.meta, color: ink.tertiary },
  codeRow: { flexDirection: 'row', justifyContent: 'space-between' },
  error: { ...typeScale.meta, color: accent.danger },
  footer: { marginTop: 'auto', alignItems: 'center' },
  primary: {
    backgroundColor: ink.primary,
    borderRadius: radius.md,
    alignItems: 'center',
    paddingVertical: 14,
  },
  primaryDisabled: { opacity: 0.45 },
  primaryText: { ...typeScale.button, color: ink.inverse },
  textButton: { paddingVertical: space.sm, paddingHorizontal: space.xs },
  textButtonLabel: { ...typeScale.label, color: ink.secondary },
});
