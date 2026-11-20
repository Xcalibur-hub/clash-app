import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ProductDetail } from '../../../components/vault/ProductDetail';
import { Notice } from '../../../components/shared/Notice';

export default function VaultProductScreen(): React.JSX.Element {
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const id = typeof productId === 'string' ? productId : '';
  return (
    <>
      <ProductDetail productId={id} />
      <Notice offset={0} />
    </>
  );
}
