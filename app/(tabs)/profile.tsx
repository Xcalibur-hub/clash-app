import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HOF_ENTRIES } from '../../data/hofTakes';
import { BadgeRow } from '../../components/profile/BadgeRow';
import { ProfileArchive } from '../../components/profile/ProfileArchive';
import { ProfileHero } from '../../components/profile/ProfileHero';
import { ReputationBar } from '../../components/profile/ReputationBar';
import { StatGrid } from '../../components/profile/StatGrid';
import { profileStyles as s } from '../../components/profile/profileStyles';
import { AuroraBackground } from '../../components/shared/AuroraBackground';
import { Chip } from '../../components/shared/Chip';
import { GlassCard } from '../../components/shared/GlassCard';
import { Notice } from '../../components/shared/Notice';
import { SectionHeading } from '../../components/shared/SectionHeading';
import { CoinIcon } from '../../components/shared/icons';
import { selectViewerTakes, selectViewerWins, useClash } from '../../store';
import { useClock } from '../../hooks/useClock';
import { radius, space } from '../../theme';

/** PROFILE (spec §15, reference screen 13) — identity, career numbers, archive. */
export default function ProfileScreen(): React.JSX.Element {
  const { state } = useClash();
  const insets = useSafeAreaInsets();
  const now = useClock();
  const viewer = state.viewer;
  const takes = React.useMemo(
    () => selectViewerTakes(state).filter((take) => take.expiresAt > now),
    [now, state],
  );
  const wins = React.useMemo(() => selectViewerWins(state), [state]);
  /** Museum records the viewer authored — their own immortal takes. */
  const immortal = React.useMemo(
    () =>
      HOF_ENTRIES.filter((entry) =>
        state.takes.some((take) => take.id === entry.takeId && take.authorId === viewer.id),
      ),
    [state.takes, viewer.id],
  );

  return (
    <AuroraBackground tone="calm">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          s.content,
          { paddingTop: insets.top + space.md, paddingBottom: space.xxl },
        ]}
      >
        <View style={s.topRow}>
          <Text allowFontScaling={false} style={s.wordmark}>
            PROFILE
          </Text>
          <Chip label={String(viewer.coins)} icon={CoinIcon} tone="gold" data />
        </View>

        <ProfileHero viewer={viewer} />

        <StatGrid viewer={viewer} />

        <GlassCard level="soft" corner={radius.card} contentStyle={s.rep}>
          <ReputationBar reputation={viewer.reputation} />
        </GlassCard>

        <SectionHeading eyebrow="EARNED IN THE ARENA" title="Badges" />
        <BadgeRow badges={viewer.badges} />

        <ProfileArchive
          state={state}
          takes={takes}
          wins={wins}
          immortal={immortal}
          now={now}
        />
      </ScrollView>
      <Notice offset={0} />
    </AuroraBackground>
  );
}
