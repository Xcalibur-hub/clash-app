import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { CreatorAiProfile } from '../../../services/creatorAiMappers';
import { creatorAiArtworkUrl } from '../../../services/creatorAiService';
import { aiChapterCopy, aiDisclosureLabel } from '../../../utils/creatorAiState';
import { personalityRadius, type WorldPersonality } from '../../../utils/vaultWorldPersonality';
import { space, typeScale, useThemeColors } from '../../../theme';
import { VaultActionButton } from '../VaultActionButton';
import { AiDisclosure } from './AiDisclosure';

export interface AiChapterProps {
  profile: CreatorAiProfile;
  personality: WorldPersonality;
  isSelf: boolean;
  onOpen: () => void;
  onManage: () => void;
}

/**
 * "TALK TO MAYA" — an editorial plate, not a feature card. The disclosure badge
 * is part of the composition rather than an overlay, so the AI framing is
 * unavoidable from the first glance.
 */
export function AiChapter({
  profile,
  personality,
  isSelf,
  onOpen,
  onManage,
}: AiChapterProps): React.JSX.Element {
  const t = useThemeColors();
  const copy = aiChapterCopy({
    displayName: profile.displayName,
    creatorName: profile.creatorName,
  });
  const artwork = creatorAiArtworkUrl(profile.artwork);
  const radius = personalityRadius(personality);
  const locked = !isSelf && !profile.viewerAccess;

  return (
    <View style={[styles.wrap, { borderColor: t.border, borderRadius: radius }]}>
      <View style={styles.row}>
        <View style={styles.copy}>
          <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
            {copy.kicker}
          </Text>
          <Text allowFontScaling={false} style={[styles.headline, { color: t.textPrimary }]}>
            {copy.headline}
          </Text>
          <Text allowFontScaling={false} style={[styles.body, { color: t.textSecondary }]}>
            {profile.description ||
              `Built from ${profile.creatorName ?? 'this creator'}'s creator-approved material.`}
          </Text>
        </View>
        {artwork ? (
          <Image source={{ uri: artwork }} style={[styles.art, { borderRadius: radius }]} />
        ) : (
          <View
            style={[
              styles.art,
              { borderRadius: radius, backgroundColor: profile.creatorTint ?? t.surfaceMuted },
            ]}
          />
        )}
      </View>

      {profile.starters.length > 0 ? (
        <View style={styles.starters}>
          {profile.starters.slice(0, 2).map((starter) => (
            <Text key={starter} allowFontScaling={false} style={[styles.starter, { color: t.textMuted }]}>
              {`“${starter}”`}
            </Text>
          ))}
        </View>
      ) : null}

      <AiDisclosure
        displayName={profile.displayName}
        creatorName={profile.creatorName}
        variant="badge"
      />

      <View style={styles.actions}>
        {isSelf ? (
          <VaultActionButton label="Preview your AI" tone="quiet" onPress={onOpen} />
        ) : (
          <VaultActionButton
            label={locked ? `${aiDisclosureLabel(profile.creatorName)} · MEMBERS` : `ASK ${profile.displayName.toUpperCase()}`}
            onPress={onOpen}
          />
        )}
        {isSelf ? (
          <VaultActionButton label="Manage in Studio" tone="quiet" onPress={onManage} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm, borderWidth: StyleSheet.hairlineWidth, padding: space.md },
  row: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  copy: { flex: 1, gap: 2 },
  kicker: { ...typeScale.caption, fontSize: 10, fontWeight: '800', letterSpacing: 1.6 },
  headline: { ...typeScale.display, fontSize: 24, lineHeight: 27, fontWeight: '800', letterSpacing: -0.6 },
  body: { ...typeScale.meta, fontSize: 13, lineHeight: 18 },
  art: { width: 84, height: 108 },
  starters: { gap: 2 },
  starter: { ...typeScale.meta, fontSize: 12, fontStyle: 'italic' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
