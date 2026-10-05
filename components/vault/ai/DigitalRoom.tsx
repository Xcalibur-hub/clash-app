import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { CreatorAiProfile } from '../../../services/creatorAiMappers';
import type { DigitalCreatorCapability } from '../../../services/digitalCreatorMappers';
import { creatorAiArtworkUrl } from '../../../services/creatorAiService';
import { digitalCreatorArtworkUrl } from '../../../services/digitalCreatorService';
import { recorderAvailable, voiceInputAvailability } from '../../../services/speechInput';
import type { DigitalCreatorController } from '../../../hooks/useDigitalCreator';
import {
  digitalRoomModeLabel,
  digitalStageCopy,
  voiceInputNote,
  type DigitalRoomMode,
} from '../../../utils/digitalCreatorState';
import type { WorldPersonality } from '../../../utils/vaultWorldPersonality';
import { space, typeScale, useThemeColors } from '../../../theme';
import { tap as hapticTap } from '../../../utils/haptics';
import { AiStarterRow } from './AiStarterRow';
import { DigitalCreatorStage } from './DigitalCreatorStage';
import { DigitalModeSwitch } from './DigitalModeSwitch';
import { HoldToTalkControl } from './HoldToTalkControl';

export interface DigitalRoomProps {
  profile: CreatorAiProfile;
  controller: DigitalCreatorController;
  personality: WorldPersonality;
  capability: DigitalCreatorCapability;
  modes: DigitalRoomMode[];
  mode: DigitalRoomMode;
  onModeChange: (mode: DigitalRoomMode) => void;
  onPickStarter: (starter: string) => void;
}

/**
 * TALK mode.
 *
 * The avatar dominates and chrome is reduced to a microphone, a mode switch and
 * a way out — no dashboard, no card wall, no HUD. Rendering only ever happens
 * after a reply our own pipeline produced; when no provider is connected the
 * stage says so and text stays reachable.
 */
export function DigitalRoom({
  profile,
  controller,
  personality,
  capability,
  modes,
  mode,
  onModeChange,
  onPickStarter,
}: DigitalRoomProps): React.JSX.Element {
  const t = useThemeColors();
  const copy = digitalStageCopy({
    displayName: profile.displayName,
    creatorName: profile.creatorName,
    block: profile.digital,
    status: controller.status,
    requested: capability,
  });
  const artwork =
    digitalCreatorArtworkUrl(profile.digital?.artwork) ?? creatorAiArtworkUrl(profile.artwork);
  const voiceReady = voiceInputAvailability(controller.status?.configured ?? false) === 'ready';

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.head}>
        <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
          {`TALK TO ${profile.displayName.toUpperCase().replace(/^DIGITAL\s+/, '')}`}
        </Text>
        <Pressable
          onPress={() => {
            hapticTap();
            onModeChange('TEXT');
          }}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Close talk mode"
        >
          <Text allowFontScaling={false} style={[styles.exit, { color: t.textMuted }]}>
            Close
          </Text>
        </Pressable>
      </View>

      <DigitalCreatorStage
        copy={copy}
        artworkUrl={artwork}
        tint={profile.creatorTint}
        videoUrl={controller.rendered?.status === 'ok' ? controller.rendered.videoUrl : null}
        audioUrl={controller.rendered?.status === 'ok' ? controller.rendered.audioUrl : null}
        busy={controller.rendering}
        personality={personality}
      />

      <HoldToTalkControl
        available={voiceReady && controller.session !== null}
        busy={controller.rendering}
        note={voiceInputNote(recorderAvailable(), controller.status?.configured ?? false)}
        onRelease={(_heldMs, phase) => {
          if (phase === 'too_short') return;
          // A capture that never happened is never invented: text is the input
          // path until a recorder and a speech service are both configured.
          onModeChange('TEXT');
        }}
      />

      <DigitalModeSwitch modes={modes} active={mode} onChange={onModeChange} />

      <Text allowFontScaling={false} style={[styles.modeHint, { color: t.textMuted }]}>
        {`${digitalRoomModeLabel(mode)} · the reply always comes from ${profile.displayName}'s Creator AI.`}
      </Text>

      <AiStarterRow
        starters={profile.starters}
        disabled={controller.rendering}
        onPick={onPickStarter}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: space.md, paddingBottom: space.xxl },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...typeScale.section, fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  exit: { ...typeScale.label, fontWeight: '700' },
  modeHint: { ...typeScale.meta, fontSize: 12, textAlign: 'center' },
});
