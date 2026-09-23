import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TakeComposerFields } from '../../components/arena/TakeComposerFields';
import { createTakeStyles as styles } from '../../components/arena/createTakeStyles';
import { AuroraBackground } from '../../components/shared/AuroraBackground';
import { GlowButton } from '../../components/shared/GlowButton';
import { IconButton } from '../../components/shared/IconButton';
import { SectionHeading } from '../../components/shared/SectionHeading';
import { CloseIcon } from '../../components/shared/icons';
import { createTake, showNotice, useClash } from '../../store';
import { space } from '../../theme';
import { press as hapticPress, tap as hapticTap } from '../../utils/haptics';

const MAX_CHARS = 180;

const CURATED_TITLES = [
  'AI-generated videos are already better than most Hollywood trailers.',
  'The campus degree is becoming obsolete.',
  'iPhone users pay too much for the same experience.',
  'Pixel takes better photos than the iPhone.',
  'Ranked matchmaking ruined casual gaming.',
];

function suggestPrompt(): string {
  const pick = CURATED_TITLES[Math.floor(Math.random() * CURATED_TITLES.length)];
  return `"${pick}"`;
}

/**
 * TAKE CREATION (spec §7, reference screen 11): a dismissal header, one large
 * multiline field with a live 180-character counter, glass attachment buttons,
 * the hood picker, and a full-width black "Drop It" pill.
 */
export default function CreateTakeScreen(): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state, dispatch } = useClash();
  const viewer = state.viewer;
  const [text, setText] = React.useState('');
  const [hood, setHood] = React.useState<typeof viewer.hood>(viewer.hood);
  const placeholder = React.useMemo(suggestPrompt, []);

  const charsLeft = MAX_CHARS - text.length;
  const overLimit = charsLeft < 0;
  const canDrop = text.trim().length > 0 && !overLimit;

  const dismiss = (): void => {
    hapticTap();
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(tabs)');
  };

  const attach = (kind: 'image' | 'video'): void => {
    dispatch(
      showNotice(
        kind === 'image'
          ? 'Image attachments arrive with the backend.'
          : 'Video attachments arrive with the backend.',
      ),
    );
  };

  function drop(): void {
    if (!canDrop) return;
    hapticPress();
    dispatch(
      createTake({
        id: `take-${Date.now()}`,
        authorId: viewer.id,
        text: text.trim(),
        hood,
        createdAt: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        clashes: 0,
        reactions: 0,
      }),
    );
    dispatch(showNotice('Take dropped · +30 XP. It self-destructs in 24 hours.'));
    router.replace('/(tabs)');
  }

  return (
    <AuroraBackground tone="arena" doodles={false}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.root}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xxl },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <SectionHeading
            eyebrow="YOUR VOICE"
            title="What's your take?"
            marked
            accessory={
              <IconButton icon={CloseIcon} onPress={dismiss} label="Close take creation" />
            }
          />

          <TakeComposerFields
            text={text}
            onChangeText={(next) => setText(next.slice(0, MAX_CHARS))}
            placeholder={placeholder}
            charsLeft={charsLeft}
            maxChars={MAX_CHARS}
            overLimit={overLimit}
            hood={hood}
            onChangeHood={setHood}
            onAttach={attach}
          />

          <View style={{ height: space.xxl }} />
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
          <GlowButton
            label="Drop It"
            onPress={drop}
            tone="ink"
            pill
            disabled={!canDrop}
            style={styles.cta}
            accessibilityLabel="Drop your take into the Arena"
            accessibilityHint="Publishes your take and awards 30 XP"
          />
          <Text allowFontScaling={false} style={styles.disclaimer}>
            {canDrop ? 'Your take self-destructs after 24 hours.' : 'Write something first.'}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </AuroraBackground>
  );
}
