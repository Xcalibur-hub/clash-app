import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { LessonReader } from '../../../../../components/vault/LessonReader';
import { Notice } from '../../../../../components/shared/Notice';

export default function VaultLessonScreen(): React.JSX.Element {
  const { courseId, lessonId } = useLocalSearchParams<{ courseId: string; lessonId: string }>();
  return (
    <>
      <LessonReader
        courseId={typeof courseId === 'string' ? courseId : ''}
        lessonId={typeof lessonId === 'string' ? lessonId : ''}
      />
      <Notice offset={0} />
    </>
  );
}
