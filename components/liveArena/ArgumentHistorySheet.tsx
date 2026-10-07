/**
 * Secondary surface for full official argument history.
 * Kept off the main Stage so the live screen stays simple.
 */
import React from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import type { ArenaDuel } from '../../utils/arenaDuelPayload';
import type { ArenaMessage } from '../../services/liveArenaService';
import { duelFighterSide, duelTimestamp } from '../../utils/duelPresentation';
import { layout, space, typeScale, useThemeColors } from '../../theme';

export interface ArgumentHistorySheetProps {
  visible: boolean;
  duel: ArenaDuel;
  messages: readonly ArenaMessage[];
  onClose: () => void;
}

export function ArgumentHistorySheet({
  visible,
  duel,
  messages,
  onClose,
}: ArgumentHistorySheetProps): React.JSX.Element {
  const t = useThemeColors();

  const renderItem = ({ item }: ListRenderItemInfo<ArenaMessage>) => {
    const side = duelFighterSide(duel, item.author?.id);
    const stamp = duelTimestamp(item.createdAt);
    return (
      <View style={[styles.row, { borderBottomColor: t.border }]}>
        <Text style={[styles.meta, { color: t.textMuted }]}>
          {side ? `Side ${side}` : 'Notice'}
          {item.author?.name ? ` · ${item.author.name}` : ''}
          {stamp ? ` · ${stamp}` : ''}
        </Text>
        <Text selectable style={[styles.body, { color: t.textPrimary }]}>
          {item.body}
        </Text>
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: t.background }]}>
          <View style={styles.head}>
            <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
              Argument history
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close argument history"
              onPress={onClose}
              style={styles.closeHit}
            >
              <Text style={[styles.close, { color: t.textPrimary }]}>Close</Text>
            </Pressable>
          </View>
          <FlatList
            data={[...messages]}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <Text style={[styles.empty, { color: t.textMuted }]}>
                No official arguments yet.
              </Text>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    maxHeight: '78%',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: space.xl,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenX,
    paddingVertical: space.md,
  },
  title: { ...typeScale.label, fontSize: 16, fontWeight: '800' },
  closeHit: { minHeight: 44, justifyContent: 'center', paddingLeft: space.md },
  close: { ...typeScale.label, fontSize: 14, fontWeight: '700' },
  list: { paddingHorizontal: layout.screenX, paddingBottom: space.xl },
  row: {
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  meta: { ...typeScale.caption, fontSize: 12, fontWeight: '700' },
  body: { ...typeScale.body, fontSize: 15, lineHeight: 22 },
  empty: { ...typeScale.meta, fontSize: 14, paddingVertical: space.xl },
});
