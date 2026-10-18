import React from 'react';
import { View } from 'react-native';
import type { CommentSort } from '../../../store';
import { ArenaButton } from './ArenaPrimitives';

/** Intrinsically sized 44dp controls; can wrap independently of the heading. */
export function ArenaReplySort({ value, onChange }: { value: CommentSort; onChange: (sort: CommentSort) => void }): React.JSX.Element {
  return <View accessibilityRole="tablist" accessibilityLabel="Sort replies" style={{ flexDirection: 'row', gap: 4 }}>
    {(['best', 'new'] as const).map(sort => <ArenaButton key={sort} label={sort === 'best' ? 'Best' : 'New'}
      selected={sort === value} variant={sort === value ? 'secondary' : 'tertiary'} onPress={() => onChange(sort)} />)}
  </View>;
}
