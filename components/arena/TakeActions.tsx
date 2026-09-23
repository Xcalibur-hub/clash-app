import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Take } from '../../store';
import { ink, space, typeScale } from '../../theme';
import { compact } from '../../utils/format';
import { GlowButton } from '../shared/GlowButton';
import { IconButton } from '../shared/IconButton';
import { ArenaIcon, BookmarkIcon, FlameIcon, MoreIcon, ShareIcon } from '../shared/icons';

export interface TakeActionsProps {
  take: Take;
  challengerHandle?: string;
  isSaved: boolean;
  hasReacted: boolean;
  onClash: () => void;
  onReact: () => void;
  onSave: () => void;
  onShare: () => void;
  onMore: () => void;
}

/**
 * Engagement line (`🔥 18 Clashes • 💬 243 Reactions`), the full-width CLASH pill
 * and the secondary card actions (reference "Arena Home", screen 5).
 */
export function TakeActions({
  take,
  challengerHandle,
  isSaved,
  hasReacted,
  onClash,
  onReact,
  onSave,
  onShare,
  onMore,
}: TakeActionsProps): React.JSX.Element {
  return (
    <View style={styles.wrap}>
      <View style={styles.statsRow}>
        <Text
          allowFontScaling={false}
          style={styles.stat}
          accessibilityLabel={`${take.clashes} clashes`}
        >
          {'🔥 '}
          <Text style={styles.statValue}>{compact(take.clashes)}</Text>
          {' Clashes'}
        </Text>
        <Text allowFontScaling={false} style={styles.bullet}>
          {'•'}
        </Text>
        <Text
          allowFontScaling={false}
          style={styles.stat}
          accessibilityLabel={`${take.reactions} reactions`}
        >
          {'💬 '}
          <Text style={styles.statValue}>{compact(take.reactions)}</Text>
          {' Reactions'}
        </Text>
        <View style={styles.spacer} />
        <IconButton
          icon={MoreIcon}
          onPress={onMore}
          label={`More options for take ${take.id}`}
          size={30}
        />
      </View>

      <GlowButton
        label="CLASH"
        icon={ArenaIcon}
        tone="ink"
        pill
        onPress={onClash}
        style={styles.cta}
        accessibilityLabel="Clash on this take"
      />

      <View style={styles.secondaryRow}>
        <IconButton
          icon={FlameIcon}
          onPress={onReact}
          label="React to this take"
          size={34}
          active={hasReacted}
          tone="a"
        />
        <IconButton
          icon={BookmarkIcon}
          onPress={onSave}
          label={isSaved ? 'Remove from saved' : 'Save this take'}
          size={34}
          active={isSaved}
          tone="gold"
        />
        <IconButton icon={ShareIcon} onPress={onShare} label="Share this take" size={34} />
        {challengerHandle ? (
          <Text allowFontScaling={false} style={styles.versus}>
            {`vs @${challengerHandle}`}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  stat: { ...typeScale.data, fontSize: 11.5, color: ink.secondary },
  statValue: { color: ink.primary },
  bullet: { ...typeScale.data, fontSize: 11.5, color: ink.quaternary },
  spacer: { flex: 1 },
  cta: { alignSelf: 'stretch' },
  secondaryRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  versus: { ...typeScale.meta, color: ink.quaternary, marginLeft: 'auto' },
});
