import React from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DuelRoomExperience } from '../liveArena/DuelRoomExperience';
import { useThemeColors } from '../../theme';
import {
  buildDevPreviewRoom,
  type PreviewStage,
} from './devArenaPreviewFixture';

export interface DevActiveArenaPreviewProps {
  initialStage: PreviewStage;
  onExit: () => void;
}

/** Development-only in-memory preview exercising real DuelRoomExperience components. */
export default function DevActiveArenaPreview({
  initialStage,
  onExit,
}: DevActiveArenaPreviewProps): React.JSX.Element {
  const t = useThemeColors();
  const insets = useSafeAreaInsets();
  const [stage, setStage] = React.useState<PreviewStage>(initialStage);
  const [focusEpoch, setFocusEpoch] = React.useState(0);

  React.useEffect(() => {
    setStage(initialStage);
  }, [initialStage]);

  React.useEffect(() => {
    const sub = AppState.addEventListener('change', next => {
      if (next === 'active') setFocusEpoch(n => n + 1);
    });
    return () => sub.remove();
  }, []);

  const { room, messages } = React.useMemo(() => {
    const perf = typeof performance !== 'undefined' ? performance.now() : 0;
    return buildDevPreviewRoom(stage, Date.now(), perf);
  }, [stage, focusEpoch]);

  return (
    <View style={[styles.root, { backgroundColor: t.background }]}>
      <DuelRoomExperience
        key={`preview-${stage}`}
        room={room}
        messages={messages}
        evidence={[]}
        paddingTop={insets.top}
        paddingBottom={insets.bottom}
        spectatorCount={2}
        loading={false}
        refreshing={false}
        loadingOlder={false}
        hasOlder={false}
        threadLocked={stage === 'watch'}
        error={null}
        composer={null}
        onBack={onExit}
        onReturn={onExit}
        onRefresh={async () => undefined}
        onLoadOlder={async () => undefined}
        onWatch={async () => {
          setStage('open');
        }}
        onJudge={async () => {
          throw new Error('Preview mode: live ballot submission disabled');
        }}
        onReply={() => undefined}
        onExpressiveReply={() => undefined}
        onReact={() => undefined}
        onMarkEvidence={() => undefined}
        onReport={() => undefined}
        onReportEvidence={() => undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
