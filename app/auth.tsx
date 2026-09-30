import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../store/AuthProvider';
import { analytics } from '../services/analytics';
import { SupabaseError } from '../services/supabaseClient';
import { layout, radius, space, typeScale, useThemeColors } from '../theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Hosted Supabase may deliver 6–10 digit numeric email OTPs. */
const OTP_MIN_LENGTH = 6;
const OTP_MAX_LENGTH = 10;

/** Client-side resend cooldown only — not a backend rule. */
const RESEND_COOLDOWN_SEC = 30;

function normalizeOtp(value: string): string {
  return value.replace(/\D/g, '').slice(0, OTP_MAX_LENGTH);
}

function isOtpComplete(value: string): boolean {
  return value.length >= OTP_MIN_LENGTH && value.length <= OTP_MAX_LENGTH;
}

function authErrorMessage(error: unknown): string {
  if (error instanceof SupabaseError) {
    const code = error.code.toLowerCase();
    const msg = error.message.toLowerCase();
    if (code.includes('rate') || msg.includes('rate') || msg.includes('too many')) {
      return 'Too many attempts. Wait a moment and try again.';
    }
    if (msg.includes('expired') || code.includes('expired')) {
      return 'That code expired. Request a new one.';
    }
    if (msg.includes('invalid') && (msg.includes('token') || msg.includes('otp') || msg.includes('code'))) {
      return 'That code isn’t right. Check it and try again.';
    }
    if (msg.includes('email') && msg.includes('invalid')) {
      return 'Enter a valid email address.';
    }
    if (msg.includes('network') || msg.includes('fetch') || code === 'network') {
      return 'Network issue. Check your connection and try again.';
    }
    return error.message;
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('network') || msg.includes('fetch')) {
      return 'Network issue. Check your connection and try again.';
    }
    return error.message;
  }
  return 'Something went wrong. Try again.';
}

/** Email OTP sign-in — calm, minimal, guest-friendly. */
export default function AuthScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useThemeColors();
  const { signedIn, requestOtp, verifyOtp } = useAuth();

  const [step, setStep] = React.useState<'email' | 'code'>('email');
  const [email, setEmail] = React.useState('');
  const [code, setCode] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [cooldown, setCooldown] = React.useState(0);
  const emailRef = React.useRef<TextInput>(null);
  const codeRef = React.useRef<TextInput>(null);

  const emailValid = EMAIL_RE.test(email.trim());
  const codeValid = isOtpComplete(code);

  React.useEffect(() => {
    if (!signedIn) return;
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, [signedIn, router]);

  React.useEffect(() => {
    if (cooldown <= 0) return undefined;
    const id = setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (step === 'email') emailRef.current?.focus();
      else codeRef.current?.focus();
    }, 280);
    return () => clearTimeout(timer);
  }, [step]);

  const browseAsGuest = (): void => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const sendCode = async (): Promise<void> => {
    if (!emailValid || busy) return;
    if (step === 'code' && cooldown > 0) return;
    setBusy(true);
    setError(null);
    try {
      await requestOtp(email.trim());
      setStep('code');
      setCooldown(RESEND_COOLDOWN_SEC);
    } catch (caught) {
      setError(authErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (): Promise<void> => {
    if (!codeValid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await verifyOtp(email.trim(), code);
      // Success only — identity attach happens in AuthHydrator.
      analytics.track('auth_completed', { source: 'otp' });
    } catch (caught) {
      setError(authErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: t.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: insets.top + space.xl,
              paddingBottom: insets.bottom + space.xl,
            },
          ]}
        >
          <View style={styles.head}>
            <Text style={[styles.wordmark, { color: t.textPrimary }]}>CLASH</Text>
            <Text style={[styles.sub, { color: t.textSecondary }]}>
              {step === 'email'
                ? 'Say what everyone else is thinking.'
                : 'Check your inbox.'}
            </Text>
          </View>

          {step === 'email' ? (
            <View style={styles.form}>
              <Text style={[styles.label, { color: t.textMuted }]}>Email</Text>
              <TextInput
                ref={emailRef}
                value={email}
                onChangeText={(next) => {
                  setEmail(next);
                  if (error) setError(null);
                }}
                placeholder="you@example.com"
                placeholderTextColor={t.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                autoComplete="email"
                returnKeyType="go"
                onSubmitEditing={() => void sendCode()}
                style={[
                  styles.input,
                  {
                    color: t.textPrimary,
                    borderColor: t.border,
                    backgroundColor: t.inputBackground,
                  },
                ]}
                accessibilityLabel="Email address"
              />
              <PrimaryButton
                label={busy ? 'Sending…' : 'Continue'}
                onPress={() => void sendCode()}
                disabled={!emailValid || busy}
                loading={busy}
                fill={t.clashFill}
                text={t.clashText}
              />
            </View>
          ) : (
            <View style={styles.form}>
              <Text style={[styles.codeHint, { color: t.textSecondary }]}>
                We sent a code to{'\n'}
                <Text style={{ color: t.textPrimary, fontWeight: '600' }}>{email.trim()}</Text>
              </Text>
              <Text style={[styles.label, { color: t.textMuted }]}>Code</Text>
              <TextInput
                ref={codeRef}
                value={code}
                onChangeText={(text) => {
                  setCode(normalizeOtp(text));
                  if (error) setError(null);
                }}
                placeholder="Enter code"
                placeholderTextColor={t.textMuted}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                maxLength={OTP_MAX_LENGTH}
                returnKeyType="done"
                onSubmitEditing={() => void confirm()}
                style={[
                  styles.input,
                  styles.code,
                  {
                    color: t.textPrimary,
                    borderColor: t.border,
                    backgroundColor: t.inputBackground,
                  },
                ]}
                accessibilityLabel="Verification code"
              />
              <PrimaryButton
                label={busy ? 'Verifying…' : 'Verify'}
                onPress={() => void confirm()}
                disabled={!codeValid || busy}
                loading={busy}
                fill={t.clashFill}
                text={t.clashText}
              />
              <View style={styles.codeActions}>
                <TextButton
                  label={cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                  onPress={() => void sendCode()}
                  disabled={busy || cooldown > 0}
                  color={t.textSecondary}
                />
                <TextButton
                  label="Change email"
                  onPress={() => {
                    setCode('');
                    setError(null);
                    setStep('email');
                  }}
                  color={t.textSecondary}
                />
              </View>
            </View>
          )}

          {error ? (
            <Text style={[styles.error, { color: t.danger }]} accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}

          <View style={styles.dividerRow}>
            <View style={[styles.divider, { backgroundColor: t.border }]} />
            <Text style={[styles.dividerText, { color: t.textMuted }]}>or</Text>
            <View style={[styles.divider, { backgroundColor: t.border }]} />
          </View>

          <TextButton
            label="Browse as guest"
            onPress={browseAsGuest}
            color={t.textSecondary}
            centered
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
  fill,
  text,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  fill: string;
  text: string;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled), busy: Boolean(loading) }}
      style={[styles.primary, { backgroundColor: fill }, disabled && styles.primaryDisabled]}
    >
      {loading ? (
        <ActivityIndicator color={text} />
      ) : (
        <Text style={[styles.primaryText, { color: text }]}>{label}</Text>
      )}
    </Pressable>
  );
}

function TextButton({
  label,
  onPress,
  disabled,
  color,
  centered,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  color: string;
  centered?: boolean;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={[styles.textButton, centered && styles.textButtonCentered, disabled && styles.textButtonDisabled]}
    >
      <Text style={[styles.textButtonLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: layout.screenX,
    gap: space.lg,
    justifyContent: 'center',
  },
  head: { gap: space.sm, marginBottom: space.sm },
  wordmark: {
    ...typeScale.display,
    fontSize: 36,
    lineHeight: 40,
    letterSpacing: -1.2,
  },
  sub: { ...typeScale.body, fontSize: 17, lineHeight: 24 },
  form: { gap: space.sm },
  label: { ...typeScale.caption, letterSpacing: 0.4 },
  codeHint: { ...typeScale.body, marginBottom: space.xs },
  input: {
    ...typeScale.body,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: 15,
    minHeight: 52,
  },
  code: {
    textAlign: 'center',
    letterSpacing: 6,
    fontSize: 22,
    lineHeight: 28,
    fontVariant: ['tabular-nums'],
  },
  codeActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: space.md,
    marginTop: space.xs,
  },
  error: { ...typeScale.meta },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginTop: space.sm,
  },
  divider: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerText: { ...typeScale.meta },
  primary: {
    minHeight: 52,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.xs,
  },
  primaryDisabled: { opacity: 0.45 },
  primaryText: { ...typeScale.button },
  textButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
  },
  textButtonCentered: { alignItems: 'center' },
  textButtonDisabled: { opacity: 0.45 },
  textButtonLabel: { ...typeScale.label },
});
