import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ServiceDetail } from '../../../components/vault/ServiceDetail';
import { Notice } from '../../../components/shared/Notice';

export default function VaultServiceScreen(): React.JSX.Element {
  const { serviceId } = useLocalSearchParams<{ serviceId: string }>();
  const id = typeof serviceId === 'string' ? serviceId : '';
  return (
    <>
      <ServiceDetail serviceId={id} />
      <Notice offset={0} />
    </>
  );
}
