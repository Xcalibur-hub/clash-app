import React from 'react';
import { Image } from 'react-native';
import { useRetryableRead } from '../../hooks/useRetryableRead';
import { ReadFeedback } from '../shared/ReadFeedback';
import { MediaViewer } from '../shared/MediaViewer';
import { VaultActionButton } from './VaultActionButton';

export interface VaultReaderAsset { url: string; kind: string }
/** Only mounts with an authorized public/preview URL or a successful existing signer result. */
export function VaultReaderMedia({ load, scope }: { load: () => Promise<VaultReaderAsset | null>; scope: string }): React.JSX.Element | null {
  const read = useRetryableRead(load, scope);
  const [failed, setFailed] = React.useState(false), [open, setOpen] = React.useState(false);
  if (read.status === 'missing') return null;
  if (read.status !== 'ready' || !read.data || failed) return (
    <ReadFeedback status={failed ? 'error' : read.status} subject="Media" retry={() => { setFailed(false); read.retry(); }} />
  );
  const video = read.data.kind === 'video';
  return <>
    {video ? <VaultActionButton label="Play video" onPress={() => setOpen(true)} />
      : <Image source={{ uri: read.data.url }} accessibilityRole="image" accessibilityLabel="Content media"
        style={{ width: '100%', aspectRatio: 4 / 5, borderRadius: 18 }} resizeMode="contain" onError={() => setFailed(true)} />}
    {video && open ? <MediaViewer visible uri={read.data.url} kind="video" onClose={() => setOpen(false)} /> : null}
  </>;
}
