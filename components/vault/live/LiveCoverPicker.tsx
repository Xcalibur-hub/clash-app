import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useMediaPicker, type PickedMedia } from '../../../hooks/useMediaPicker';
import {
  completeUpload,
  createUpload,
  failUpload,
  readPickedBytes,
  uploadFile,
} from '../../../services/mediaService';
import { errorText } from '../../../services/supabaseClient';
import { showNotice, useClash } from '../../../store';
import { radius, space, typeScale, useThemeColors } from '../../../theme';
import { VaultActionButton } from '../VaultActionButton';

export interface LiveCoverPickerProps {
  mediaObjectId: string | null;
  previewUri: string | null;
  onChange: (next: { mediaObjectId: string | null; previewUri: string | null }) => void;
}

function mimeFor(media: PickedMedia): string {
  if (media.mimeType) return media.mimeType;
  const ext = media.uri.split('.').pop()?.toLowerCase();
  const known: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
  };
  if (ext && known[ext]) return known[ext];
  return 'image/jpeg';
}

/**
 * Optional cover/poster for a live session.
 *
 * Reuses the app's standard upload path (pick → createUpload → uploadFile →
 * completeUpload) so the server only ever sees finished, owned public media.
 */
export function LiveCoverPicker({
  mediaObjectId,
  previewUri,
  onChange,
}: LiveCoverPickerProps): React.JSX.Element {
  const t = useThemeColors();
  const { dispatch } = useClash();
  const { pickImage } = useMediaPicker();
  const [busy, setBusy] = React.useState(false);

  const attach = async (): Promise<void> => {
    const picked = await pickImage();
    if (!picked) return;
    setBusy(true);
    const mime = mimeFor(picked);
    let planId: string | null = null;
    try {
      const plan = await createUpload('image', mime, 'public');
      planId = plan.id;
      const bytes = await readPickedBytes(picked.uri);
      await uploadFile(plan, bytes, mime);
      await completeUpload(plan.id, bytes.byteLength, {
        width: picked.width,
        height: picked.height,
      });
      onChange({ mediaObjectId: plan.id, previewUri: picked.uri });
    } catch (error) {
      if (planId) void failUpload(planId).catch(() => undefined);
      dispatch(showNotice(errorText(error)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Text allowFontScaling={false} style={[styles.label, { color: t.textMuted }]}>
        COVER (OPTIONAL)
      </Text>
      {previewUri ? (
        <Image source={{ uri: previewUri }} style={[styles.preview, { borderColor: t.border }]} />
      ) : (
        <View style={[styles.preview, styles.placeholder, { borderColor: t.border, backgroundColor: t.surfaceMuted }]} />
      )}
      <View style={styles.row}>
        <VaultActionButton
          label={busy ? 'Uploading…' : mediaObjectId ? 'Replace cover' : 'Attach cover'}
          tone="quiet"
          compact
          onPress={() => void attach()}
        />
        {mediaObjectId ? (
          <VaultActionButton
            label="Remove"
            tone="quiet"
            compact
            onPress={() => onChange({ mediaObjectId: null, previewUri: null })}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  label: { ...typeScale.caption, fontWeight: '800', letterSpacing: 0.8 },
  preview: { width: '100%', height: 120, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  placeholder: { opacity: 0.7 },
  row: { flexDirection: 'row', gap: space.sm },
});
