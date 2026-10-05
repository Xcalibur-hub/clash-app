import React from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmptyState } from '../../../components/shared/EmptyState';
import { Notice } from '../../../components/shared/Notice';
import { WorldIcon } from '../../../components/shared/icons';
import { AiComposer } from '../../../components/vault/ai/AiComposer';
import { AiDisclosure } from '../../../components/vault/ai/AiDisclosure';
import { AiMessageBubble } from '../../../components/vault/ai/AiMessageBubble';
import { AiProviderNotice } from '../../../components/vault/ai/AiProviderNotice';
import { AiStarterRow } from '../../../components/vault/ai/AiStarterRow';
import { useCreatorAi } from '../../../hooks/useCreatorAi';
import { creatorAiArtworkUrl } from '../../../services/creatorAiService';
import { canSendAiMessage, aiDisclosureLabel } from '../../../utils/creatorAiState';
import { worldPersonality } from '../../../utils/vaultWorldPersonality';
import { layout, space, typeScale, useThemeColors } from '../../../theme';
import { tap as hapticTap } from '../../../utils/haptics';

/**
 * The AI room. Chrome is deliberately minimal, but the disclosure plate is
 * permanent — identity is the one thing this screen may never hide.
 */
export default function CreatorAiScreen(): React.JSX.Element {
  const params = useLocalSearchParams<{ creatorId: string | string[] }>();
  const creatorId = Array.isArray(params.creatorId) ? params.creatorId[0] : params.creatorId;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useThemeColors();

  const ai = useCreatorAi(creatorId);
  const [draft, setDraft] = React.useState('');
  const scroller = React.useRef<ScrollView | null>(null);

  const profile = ai.profile;
  const personality = worldPersonality({
    creatorId: creatorId ?? 'world',
    handle: profile?.creatorHandle ?? null,
    name: profile?.creatorName ?? null,
  });

  const gating = {
    canChat: profile?.canChat ?? false,
    viewerAccess: profile?.viewerAccess ?? false,
    enabled: profile?.enabled ?? false,
    isOwner: profile?.isOwner ?? false,
    providerReady: ai.providerReady,
    sending: ai.sending,
  };
  const canSend = canSendAiMessage({ ...gating, draft });

  if (ai.loading) {
    return (
      <View style={[styles.center, { backgroundColor: t.background }]}>
        <ActivityIndicator color={t.textPrimary} />
      </View>
    );
  }

  if (profile === null || (ai.error !== null && profile === null)) {
    return (
      <View style={[styles.center, { backgroundColor: t.background, paddingTop: insets.top }]}>
        <EmptyState
          icon={WorldIcon}
          title="No AI room here"
          body={ai.error ?? 'This creator has not opened an AI version.'}
          actionLabel="BACK"
          onAction={() => router.back()}
        />
        <Notice offset={0} />
      </View>
    );
  }

  const artwork = creatorAiArtworkUrl(profile.artwork);

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <ScrollView
        ref={(node) => {
          scroller.current = node;
        }}
        contentContainerStyle={{
          paddingTop: insets.top + space.sm,
          paddingHorizontal: layout.screenX,
          paddingBottom: insets.bottom + space.xxl,
          gap: space.md,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable
            onPress={() => {
              hapticTap();
              router.back();
            }}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Text allowFontScaling={false} style={[styles.back, { color: t.textMuted }]}>
              ← Back
            </Text>
          </Pressable>
          {profile.creatorId ? (
            <Pressable
              onPress={() => router.push(`/vault/${profile.creatorId}`)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Open the creator world"
            >
              <Text allowFontScaling={false} style={[styles.back, { color: t.textMuted }]}>
                Their world
              </Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.lockup}>
          {artwork ? (
            <Image source={{ uri: artwork }} style={styles.art} />
          ) : (
            <View style={[styles.art, { backgroundColor: profile.creatorTint ?? t.surfaceMuted }]} />
          )}
          <View style={styles.lockupCopy}>
            <Text allowFontScaling={false} style={[styles.name, { color: t.textPrimary }]}>
              {profile.displayName}
            </Text>
            <Text allowFontScaling={false} style={[styles.access, { color: t.textMuted }]}>
              {profile.access === 'SUBSCRIBER' ? 'MEMBERS ONLY' : 'OPEN TO EVERYONE'}
            </Text>
          </View>
        </View>

        <AiDisclosure displayName={profile.displayName} creatorName={profile.creatorName} />
        <AiProviderNotice providerReady={ai.providerReady} externalError={ai.externalError} />

        {profile.welcomeMessage.length > 0 ? (
          <View style={[styles.welcome, { borderColor: t.border }]}>
            <Text allowFontScaling={false} style={[styles.welcomeLabel, { color: t.textMuted }]}>
              WELCOME NOTE · WRITTEN BY {aiDisclosureLabel(profile.creatorName).replace('AI VERSION OF ', '')}
            </Text>
            <Text allowFontScaling={false} style={[styles.welcomeBody, { color: t.textSecondary }]}>
              {profile.welcomeMessage}
            </Text>
          </View>
        ) : null}

        {ai.hasOlder ? (
          <Pressable
            onPress={() => void ai.loadOlder()}
            disabled={ai.loadingOlder}
            accessibilityRole="button"
            accessibilityLabel="Load older messages"
          >
            <Text allowFontScaling={false} style={[styles.more, { color: t.textMuted }]}>
              {ai.loadingOlder ? 'Loading…' : 'Load older messages'}
            </Text>
          </Pressable>
        ) : null}

        {ai.messages.map((message) => (
          <AiMessageBubble
            key={message.id}
            message={message}
            onReport={(messageId) => void ai.report(messageId, 'other')}
          />
        ))}

        {!gating.canChat ? (
          <Text allowFontScaling={false} style={[styles.quiet, { color: t.textMuted }]}>
            {gating.isOwner
              ? 'This is your own AI room. Use Preview in Studio.'
              : gating.enabled
                ? 'This AI is for subscribers.'
                : 'This creator has switched their AI off.'}
          </Text>
        ) : null}

        <AiStarterRow
          starters={profile.starters}
          disabled={!canSend}
          onPick={(starter) => setDraft(starter)}
        />
      </ScrollView>

      {gating.canChat ? (
        <View
          style={[
            styles.composer,
            { paddingBottom: insets.bottom + space.sm, borderColor: t.border, backgroundColor: t.background },
          ]}
        >
          <AiComposer
            value={draft}
            onChange={setDraft}
            canSend={canSend}
            gating={gating}
            onSend={() => {
              const text = draft;
              setDraft('');
              void ai.send(text).then((ok) => {
                if (ok) scroller.current?.scrollToEnd({ animated: true });
              });
            }}
          />
        </View>
      ) : null}
      <Notice offset={0} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { ...typeScale.label, fontWeight: '700' },
  lockup: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  art: { width: 72, height: 72, borderRadius: 4 },
  lockupCopy: { flex: 1, gap: 2 },
  name: { ...typeScale.section, fontSize: 20, fontWeight: '800' },
  access: { ...typeScale.caption, fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  welcome: { gap: 4, paddingLeft: space.md, borderLeftWidth: 2 },
  welcomeLabel: { ...typeScale.caption, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  welcomeBody: { ...typeScale.body, fontSize: 14, lineHeight: 20 },
  more: { ...typeScale.meta, textDecorationLine: 'underline' },
  quiet: { ...typeScale.meta },
  composer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: layout.screenX, paddingTop: space.sm },
});

