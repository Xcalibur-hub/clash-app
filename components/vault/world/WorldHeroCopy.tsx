import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { layout, space, typeScale } from '../../../theme';
import { VaultActionButton } from '../VaultActionButton';

export interface WorldHeroCopyProps {
  eyebrow: string;
  creatorName: string;
  identity: string;
  following: boolean;
  isSelf: boolean;
  subscribed: boolean;
  onToggleFollow?: () => void;
  onSubscribe?: () => void;
  onManage?: () => void;
}

/** The creator's name and world actions, laid over the hero media. */
export function WorldHeroCopy({
  eyebrow,
  creatorName,
  identity,
  following,
  isSelf,
  subscribed,
  onToggleFollow,
  onSubscribe,
  onManage,
}: WorldHeroCopyProps): React.JSX.Element {
  return (
    <View style={styles.copy}>
      <Text allowFontScaling={false} style={styles.eyebrow}>
        {eyebrow}
      </Text>
      <Text allowFontScaling={false} style={styles.name} numberOfLines={2}>
        {creatorName}
      </Text>
      <Text allowFontScaling={false} style={styles.identity} numberOfLines={2}>
        {identity}
      </Text>
      <View style={styles.actions}>
        {isSelf ? (
          <VaultActionButton
            label="Manage world"
            tone="quiet"
            compact
            overMedia
            onPress={onManage ?? (() => undefined)}
          />
        ) : (
          <>
            <VaultActionButton
              label={following ? 'Following' : 'Follow'}
              tone={following ? 'quiet' : 'solid'}
              compact
              overMedia
              onPress={onToggleFollow ?? (() => undefined)}
            />
            {!subscribed ? (
              <VaultActionButton
                label="Subscribe"
                tone="quiet"
                compact
                overMedia
                onPress={onSubscribe ?? (() => undefined)}
              />
            ) : (
              <Text allowFontScaling={false} style={styles.subscribed}>
                Inside this world
              </Text>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  copy: { gap: 4, paddingHorizontal: layout.screenX, paddingBottom: 104, zIndex: 2 },
  eyebrow: {
    ...typeScale.caption,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    color: 'rgba(255,255,255,0.8)',
  },
  name: {
    ...typeScale.display,
    fontSize: 40,
    lineHeight: 42,
    fontWeight: '800',
    letterSpacing: -1.4,
    color: '#FAFAF8',
  },
  identity: { ...typeScale.body, fontSize: 15, color: 'rgba(250,250,248,0.86)', maxWidth: 300 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm },
  subscribed: {
    ...typeScale.caption,
    fontWeight: '700',
    letterSpacing: 0.4,
    color: 'rgba(250,250,248,0.8)',
  },
});
