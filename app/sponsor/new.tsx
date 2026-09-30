/**
 * Create advertiser workspace or a new sponsor campaign.
 */
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackIcon, StoreIcon } from '../../components/shared/icons';
import { EmptyState } from '../../components/shared/EmptyState';
import { GlowButton } from '../../components/shared/GlowButton';
import { useAuth } from '../../store/AuthProvider';
import { analytics } from '../../services/analytics';
import { errorText } from '../../services/supabaseClient';
import {
  createAdvertiser,
  createCampaign,
  fetchMyAdvertisers,
  type Advertiser,
} from '../../services/sponsorService';
import { layout, radius, space, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export default function SponsorNewScreen(): React.JSX.Element {
  const t = useThemeColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const { signedIn, loading: authLoading } = useAuth();

  const forceAdvertiser = mode === 'advertiser';
  const [advertisers, setAdvertisers] = React.useState<Advertiser[]>([]);
  const [boot, setBoot] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Advertiser form
  const [advName, setAdvName] = React.useState('');
  const [advSlug, setAdvSlug] = React.useState('');
  const [slugTouched, setSlugTouched] = React.useState(false);

  // Campaign form
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [currency, setCurrency] = React.useState('INR');

  React.useEffect(() => {
    if (!signedIn) {
      setBoot(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const list = await fetchMyAdvertisers();
        if (!cancelled) setAdvertisers([...list]);
      } catch (err) {
        if (!cancelled) setError(errorText(err));
      } finally {
        if (!cancelled) setBoot(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  const showAdvertiserForm = forceAdvertiser || advertisers.length === 0;

  const onCreateAdvertiser = async (): Promise<void> => {
    const name = advName.trim();
    const slug = (slugTouched ? advSlug : slugify(name)).trim();
    if (!name || !slug) {
      setError('Name and slug are required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createAdvertiser(name, slug);
      router.replace('/sponsor');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const onCreateCampaign = async (): Promise<void> => {
    const advertiser = advertisers[0];
    if (!advertiser) {
      setError('Create an advertiser workspace first.');
      return;
    }
    const trimmed = title.trim();
    if (!trimmed) {
      setError('Campaign title is required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await createCampaign({
        advertiserId: advertiser.id,
        title: trimmed,
        description: description.trim(),
        currency: currency.trim().toUpperCase() || 'INR',
        campaignType: 'REFERRAL',
      });
      analytics.track('sponsor_campaign_created', { source: 'sponsor_studio' });
      router.replace(`/sponsor/${created.id}`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  if (authLoading || boot) {
    return (
      <View style={[styles.root, { backgroundColor: t.background, paddingTop: insets.top }]}>
        <ActivityIndicator color={t.textPrimary} style={{ marginTop: 80 }} />
      </View>
    );
  }

  if (!signedIn) {
    return (
      <View style={[styles.root, { backgroundColor: t.background }]}>
        <EmptyState
          icon={StoreIcon}
          title="Sign in required"
          body="Create campaigns after signing in."
          actionLabel="Sign in"
          onAction={() => router.push('/auth')}
        />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: t.background }]}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + space.md,
            paddingBottom: insets.bottom + space.xxl,
          },
        ]}
      >
        <Pressable
          onPress={() => {
            hapticTap();
            router.back();
          }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={10}
          style={({ pressed }) => [
            styles.iconBtn,
            { borderColor: t.border, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <BackIcon size={18} color={t.textPrimary} strokeWidth={2.2} />
        </Pressable>

        <Text allowFontScaling={false} style={[styles.eyebrow, { color: t.textMuted }]}>
          Sponsor Studio
        </Text>
        <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
          {showAdvertiserForm ? 'Create your sponsor workspace' : 'New campaign'}
        </Text>
        <Text allowFontScaling={false} style={[styles.sub, { color: t.textSecondary }]}>
          {showAdvertiserForm
            ? 'Name your brand workspace. You can activate it before going live.'
            : 'Draft starts inactive. Activate when creators and links are ready.'}
        </Text>

        {showAdvertiserForm ? (
          <View style={styles.form}>
            <FieldLabel label="Brand name" />
            <TextInput
              value={advName}
              onChangeText={(v) => {
                setAdvName(v);
                if (!slugTouched) setAdvSlug(slugify(v));
              }}
              placeholder="Nova Lifestyle"
              placeholderTextColor={t.textMuted}
              style={inputStyle(t)}
              maxLength={80}
              accessibilityLabel="Brand name"
            />
            <FieldLabel label="Slug" />
            <TextInput
              value={advSlug}
              onChangeText={(v) => {
                setSlugTouched(true);
                setAdvSlug(v.toLowerCase().replace(/[^a-z0-9-]/g, ''));
              }}
              placeholder="nova-lifestyle"
              placeholderTextColor={t.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              style={inputStyle(t)}
              maxLength={48}
              accessibilityLabel="Workspace slug"
            />
            {error ? (
              <Text allowFontScaling={false} style={[styles.error, { color: t.textSecondary }]}>
                {error}
              </Text>
            ) : null}
            <GlowButton
              label={busy ? 'Creating…' : 'Create workspace'}
              onPress={() => void onCreateAdvertiser()}
              disabled={busy}
            />
          </View>
        ) : (
          <View style={styles.form}>
            <FieldLabel label="Title" />
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Summer referral drop"
              placeholderTextColor={t.textMuted}
              style={inputStyle(t)}
              maxLength={80}
              accessibilityLabel="Campaign title"
            />
            <FieldLabel label="Description" />
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Optional brief for your team"
              placeholderTextColor={t.textMuted}
              multiline
              style={[inputStyle(t), styles.multiline]}
              maxLength={400}
              accessibilityLabel="Campaign description"
            />
            <FieldLabel label="Currency" />
            <TextInput
              value={currency}
              onChangeText={(v) => setCurrency(v.toUpperCase())}
              placeholder="INR"
              placeholderTextColor={t.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={3}
              style={inputStyle(t)}
              accessibilityLabel="Currency"
            />
            {error ? (
              <Text allowFontScaling={false} style={[styles.error, { color: t.textSecondary }]}>
                {error}
              </Text>
            ) : null}
            <GlowButton
              label={busy ? 'Creating…' : 'Create campaign'}
              onPress={() => void onCreateCampaign()}
              disabled={busy}
            />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function FieldLabel({ label }: { label: string }): React.JSX.Element {
  const t = useThemeColors();
  return (
    <Text allowFontScaling={false} style={[styles.label, { color: t.textMuted }]}>
      {label}
    </Text>
  );
}

function inputStyle(t: ReturnType<typeof useThemeColors>) {
  return {
    color: t.textPrimary,
    borderColor: t.border,
    backgroundColor: t.inputBackground,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    ...typeScale.body,
  } as const;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    paddingHorizontal: layout.screenX,
    gap: space.sm,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  eyebrow: {
    ...typeScale.caption,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  title: { ...typeScale.title, fontWeight: '700' },
  sub: { ...typeScale.body, marginBottom: space.md },
  form: { gap: space.sm },
  label: { ...typeScale.caption, fontWeight: '600', marginTop: space.xs },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  error: { ...typeScale.caption, marginVertical: space.xs },
});
