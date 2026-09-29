import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { DropReader } from '../../../components/vault/DropReader';

/** The Drop reader — a free or (entitled) subscriber Drop's content. */
export default function DropRoute(): React.JSX.Element {
  const { dropId } = useLocalSearchParams<{ dropId?: string | string[] }>();
  const id = typeof dropId === 'string' ? dropId : '';
  return <DropReader dropId={id} />;
}
