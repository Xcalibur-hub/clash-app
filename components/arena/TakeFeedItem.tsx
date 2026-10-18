import React from 'react';
import { useRouter } from 'expo-router';
import { TakeFeedCard, type TakeFeedItemProps as CardProps } from './TakeFeedCard';
import { ChallengeTakeButton } from './TakeChallenges';
import { QuestionVotePanel } from './QuestionVotePanel';
export type TakeFeedItemProps = Omit<CardProps, 'onOpenAuthor' | 'children' | 'mediaPreview'>;
/** Connected slots stay here; the shared card cannot create challenges or votes. */
function TakeFeedItemBase(props: TakeFeedItemProps): React.JSX.Element {
  const router = useRouter();
  return <TakeFeedCard {...props} onOpenAuthor={() => router.push(`/profile/${props.author.id}`)}>
    {props.take.question ? <QuestionVotePanel takeId={props.take.id} choices={props.take.question} /> : null}
    {!props.isViewer ? <ChallengeTakeButton takeId={props.take.id} take={props.take} /> : null}
  </TakeFeedCard>;
}
export const TakeFeedItem = React.memo(TakeFeedItemBase);
