/**
 * Development-only Fresh Takes stage with local demo Takes.
 * Does not read production feed ranking or Supabase.
 */
import React from 'react';
import { View } from 'react-native';
import { FreshTakesSection } from '../../arena/FreshTakesSection';
import type { DemoState } from './model';
import { DemoText } from './DemoParts';

export function DemoFreshTakesPreview({ state: s }: { state: DemoState }): React.JSX.Element {
  const items = s.data.takes.slice(0, 5).map((row) => {
    const author =
      s.data.authors.find((a) => a.id === row.take.authorId) ?? s.data.authors[0];
    return {
      take: row.take,
      author,
      commentCount: row.replies,
      isSaved: s.saved.includes(row.take.id),
      hasReacted: s.reacted.includes(row.take.id),
    };
  });

  return (
    <View style={{ gap: 12 }}>
      <DemoText>
        DEMO · Populated Fresh Takes cards from local fixtures. Not production feed data.
      </DemoText>
      <FreshTakesSection
        items={items}
        now={s.now}
        onOpen={() => undefined}
        onClash={() => undefined}
        onReact={() => undefined}
        onSave={() => undefined}
        onShare={() => undefined}
        onMore={() => undefined}
      />
    </View>
  );
}
