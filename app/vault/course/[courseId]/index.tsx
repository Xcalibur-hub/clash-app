import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { CourseDetail } from '../../../../components/vault/CourseDetail';
import { Notice } from '../../../../components/shared/Notice';

export default function VaultCourseScreen(): React.JSX.Element {
  const { courseId } = useLocalSearchParams<{ courseId: string }>();
  const id = typeof courseId === 'string' ? courseId : '';
  return (
    <>
      <CourseDetail courseId={id} />
      <Notice offset={0} />
    </>
  );
}
