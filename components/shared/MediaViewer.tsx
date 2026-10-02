/**
 * Full-screen media viewer — contain on black, no crop.
 * Images use Image; videos mount an expo-video player only while open.
 */
import React from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import type { MediaKind } from '../../store/types';
import { typeScale } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';

export interface MediaViewerProps {
  visible: boolean;
  uri: string | null;
  /** Defaults to image. Video mounts a player only while visible. */
  kind?: MediaKind;
  onClose: () => void;
}

export function MediaViewer({
  visible,
  uri,
  kind = 'image',
  onClose,
}: MediaViewerProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  // RN Modal keeps children mounted when hidden — only mount media while open
  // so useVideoPlayer cannot outlive the viewer session.
  const showMedia = visible && Boolean(uri);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root} accessibilityViewIsModal>
        <Pressable
          onPress={() => {
            hapticTap();
            onClose();
          }}
          accessibilityRole="button"
          accessibilityLabel="Close media"
          style={[styles.close, { top: insets.top + 12 }]}
          hitSlop={12}
        >
          <Text allowFontScaling={false} style={styles.closeLabel}>
            Close
          </Text>
        </Pressable>
        {showMedia && kind === 'video' && uri ? (
          <ViewerVideo key={uri} uri={uri} />
        ) : showMedia && uri ? (
          <Image
            source={{ uri }}
            style={styles.media}
            resizeMode="contain"
            accessibilityRole="image"
            accessibilityLabel="Full screen media"
          />
        ) : null}
      </View>
    </Modal>
  );
}

/**
 * Mounted only while the modal is visible. `useVideoPlayer` owns release on
 * unmount — do not pause/release in cleanup (hook release runs first).
 */
function ViewerVideo({ uri }: { uri: string }): React.JSX.Element {
  const mountedRef = React.useRef(true);
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = false;
    instance.muted = false;
  });

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    // Defer play one tick so the VideoView has attached.
    const timer = setTimeout(() => {
      if (cancelled || !mountedRef.current) return;
      player.play();
    }, 16);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      // No player.pause() / player.release() — useVideoPlayer owns teardown.
    };
  }, [player]);

  return (
    <VideoView
      player={player}
      style={styles.media}
      contentFit="contain"
      nativeControls
      allowsFullscreen
      accessibilityLabel="Full screen video"
    />
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
  },
  close: {
    position: 'absolute',
    right: 16,
    zIndex: 2,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  closeLabel: { ...typeScale.label, color: '#FFFFFF', fontWeight: '600' },
  media: { width: '100%', height: '100%' },
});
