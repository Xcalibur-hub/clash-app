import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { action } from '../../theme';
import { PlusIcon } from '../shared/icons';
import { ELEVATED_SIZE } from './dockConfig';

export interface DockElevatedProps {
  onPress: () => void;
}

/** The elevated centre button that opens Take Creation (Arena only). */
export function DockElevated({ onPress }: DockElevatedProps): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Create a take"
      style={styles.elevated}
    >
      <PlusIcon size={26} color={action.text} strokeWidth={2.9} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  elevated: {
    position: 'absolute',
    top: -20,
    left: '50%',
    marginLeft: -(ELEVATED_SIZE / 2),
    width: ELEVATED_SIZE,
    height: ELEVATED_SIZE,
    borderRadius: ELEVATED_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: action.fill,
    borderWidth: 3,
    borderColor: '#08080B',
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },
});