import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { layout, space, typeScale } from '../../../theme';
import { VaultActionButton } from '../VaultActionButton';

export interface WorldHeroCopyProps {
  eyebrow: string;
  creatorName: string;
  identity: string;
  following: boolean;
  followBusy?: boolean;
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
  followBusy = false,
  isSelf,
  subscribed,
  onToggleFollow,
  onSubscribe,
  onManage,
}: WorldHeroCopyProps): React.JSX.Element {
  return (
    <View style={styles.copy}>
      <Text style={styles.eyebrow}>
        {eyebrow}
      </Text>
      <Text style={styles.name}>
        {creatorName}
      </Text>
      <Text style={styles.identity}>
        {identity}
      </Text>
      <View style={styles.actions}>
        {isSelf ? (
          <VaultActionButton
            label="Manage world"
            tone="quiet"
            compact
            overMedia
            onPress={onManage}
          />
        ) : (
          <>
            <VaultActionButton
              label={following ? 'Following' : 'Follow'}
              busy={followBusy}
              tone={following ? 'quiet' : 'solid'}
              compact
              overMedia
              onPress={onToggleFollow}
            />
            {!subscribed ? (
              <VaultActionButton
                label="Membership availability"
                tone="quiet"
                compact
                overMedia
                onPress={onSubscribe}
              />
            ) : (
              <Text style={styles.subscribed}>
                Member access
              </Text>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  copy: { gap: 5, paddingHorizontal: layout.screenX, paddingBottom: 118, zIndex: 2 },
  eyebrow: {
    ...typeScale.caption,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    color: 'rgba(255,255,255,0.8)',
  },
  name: {
    ...typeScale.display,
    fontSize: 44,
    lineHeight: 46,
    fontWeight: '800',
    letterSpacing: -1.6,
    color: '#FAFAF8',
  },
  identity: { ...typeScale.body, fontSize: 15, color: 'rgba(250,250,248,0.86)', maxWidth: 300 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm, marginTop: space.sm },
  subscribed: {
    ...typeScale.caption,
    fontWeight: '700',
    letterSpacing: 0.4,
    color: 'rgba(250,250,248,0.8)',
  },
});
