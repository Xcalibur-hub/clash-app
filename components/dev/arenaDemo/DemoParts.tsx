import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { arena, arenaColors } from '../../../theme/arena';
import { useThemeColors } from '../../../theme';
import { ArenaButton, ArenaIdentity, ArenaSurface } from '../../arena/ui/ArenaPrimitives';
import { constellationLayout } from '../../../utils/topicConstellation';
import { DemoMedia } from './DemoMedia';
import type { DemoMediaKind, DemoReply, DemoState, DemoTopic } from './model';

export function DemoText({ children, heading = false }: { children: React.ReactNode; heading?: boolean }): React.JSX.Element {
  const c = arenaColors(useThemeColors());
  return <Text style={[heading ? arena.type.heading : arena.type.body, { color: heading ? c.ink : c.secondary }]}>{children}</Text>;
}
export function DemoSheet({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }): React.JSX.Element {
  const c = arenaColors(useThemeColors());
  return <Modal visible transparent animationType="none" onRequestClose={onClose}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.65)' }}>
      <View style={[arena.sheet, { backgroundColor: c.page, maxHeight: '88%' }]} accessibilityViewIsModal>
        <View style={styles.row}><View style={{ flex: 1 }}><DemoText heading>DEMO · {title}</DemoText></View><ArenaButton label="Close" onPress={onClose} /></View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12, paddingBottom: 24 }}>{children}</ScrollView>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}
export function DemoForm({ label, onSend, attachments = true, max = 180 }: { label: string; onSend: (text: string, media?: DemoMediaKind) => void; attachments?: boolean; max?: number }): React.JSX.Element {
  const c = arenaColors(useThemeColors());
  const [text, setText] = React.useState(''), [media, setMedia] = React.useState<DemoMediaKind>();
  return <View style={{ gap: 8 }}>
    <TextInput accessibilityLabel={label} placeholder={label} placeholderTextColor={c.muted} multiline maxLength={max} value={text} onChangeText={setText}
      style={[arena.input, arena.type.body, { color: c.ink, borderColor: c.strongLine, minHeight: 72, maxHeight: 120, textAlignVertical: 'top', paddingVertical: 10 }]} />
    {media ? <DemoMedia kind={media} compact /> : null}
    <View style={styles.row}>
      {attachments ? (['image', 'video', 'gif'] as const).map(kind => <ArenaButton key={kind} label={kind.toUpperCase()} selected={media === kind} variant="tertiary" onPress={() => setMedia(value => value === kind ? undefined : kind)} />) : null}
      <ArenaButton label="Send demo" variant="primary" disabled={!text.trim()} onPress={() => { onSend(text, media); setText(''); setMedia(undefined); }} />
    </View>
    <Text style={[arena.type.meta, { color: c.muted }]}>Local simulation only · no upload, camera or server request</Text>
  </View>;
}

export function DemoThread({ state, rows, onReply, onVote, onMedia, parent, depth = 0 }: {
  state: DemoState; rows: DemoReply[]; parent?: string; depth?: number;
  onReply: (id: string) => void; onVote: (id: string) => void; onMedia: (kind: DemoMediaKind) => void;
}): React.JSX.Element {
  const c = arenaColors(useThemeColors()), [collapsed, setCollapsed] = React.useState<string[]>([]);
  return <View style={{ gap: 12 }}>
    {rows.filter(row => row.parentId === parent).map(row => <View key={row.id} style={{ borderLeftWidth: depth ? 1 : 0, borderLeftColor: c.strongLine, paddingLeft: depth ? 8 : 0, marginLeft: depth && depth < 3 ? 8 : 0, gap: 8 }}>
      <ArenaIdentity name={state.data.authors[row.author].name} detail={`@${state.data.authors[row.author].handle} · DEMO`} />
      <DemoText>{row.text}</DemoText>
      {row.media ? <DemoMedia kind={row.media} compact onOpen={() => onMedia(row.media!)} /> : null}
      <View style={styles.row}>
        <ArenaButton label={`↑ ${row.votes}`} variant="tertiary" onPress={() => onVote(row.id)} />
        <ArenaButton label="Reply" variant="tertiary" onPress={() => onReply(row.id)} />
        {rows.some(child => child.parentId === row.id) ? <ArenaButton label={collapsed.includes(row.id) ? 'Show replies' : 'Hide replies'} variant="tertiary" onPress={() => setCollapsed(old => old.includes(row.id) ? old.filter(id => id !== row.id) : [...old, row.id])} /> : null}
      </View>
      {!collapsed.includes(row.id) ? <DemoThread state={state} rows={rows} parent={row.id} depth={depth + 1} onReply={onReply} onVote={onVote} onMedia={onMedia} /> : null}
    </View>)}
  </View>;
}

export function DemoConstellation({ topics, selected, onSelect }: { topics: DemoTopic[]; selected?: string; onSelect: (id: string) => void }): React.JSX.Element {
  const c = arenaColors(useThemeColors()), { width, fontScale } = useWindowDimensions();
  const graph = constellationLayout(topics, Math.min(648, width - 32), fontScale);
  return <ArenaSurface style={{ padding: 0, overflow: 'hidden' }}>
    <View accessibilityLabel="Demo topic constellation" style={{ height: graph.height }}>
      <Svg width="100%" height={graph.height} pointerEvents="none" style={StyleSheet.absoluteFill}>
        {graph.edges.map(([a, b]) => <Line key={`${a}-${b}`} x1={graph.points[a].x} y1={graph.points[a].y + 22} x2={graph.points[b].x} y2={graph.points[b].y + 22} stroke={c.strongLine} strokeWidth={selected === graph.points[a].id || selected === graph.points[b].id ? 2 : 1} />)}
      </Svg>
      {graph.points.map(node => <Pressable key={node.id} accessibilityRole="button" accessibilityLabel={`Demo topic ${node.label}`} accessibilityState={{ selected: selected === node.id }} onPress={() => onSelect(node.id)}
        style={{ position: 'absolute', left: node.x - graph.cell / 2 + 4, top: node.y, width: graph.cell - 8, minHeight: 80, alignItems: 'center', padding: 4, gap: 8 }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: selected === node.id ? c.fill : c.inset }}><Text style={{ color: selected === node.id ? c.onFill : c.ink, fontSize: 18 }}>#</Text></View>
        <Text style={[arena.type.label, { color: c.ink, textAlign: 'center' }]}>{node.label}</Text>
      </Pressable>)}
    </View>
  </ArenaSurface>;
}
const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 } });
