import React from 'react';
import { Pressable, StyleSheet, Text, TextInput } from 'react-native';
import { action, ink, radius, space, typeScale } from '../../theme';
import { CloseIcon, SearchIcon } from '../shared/icons';
import { IconButton } from '../shared/IconButton';
import { tap as hapticTap } from '../../utils/haptics';

const styles = StyleSheet.create({
  shell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    borderRadius: radius.card,
    backgroundColor: 'rgba(15,15,20,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  input: { flex: 1, ...typeScale.body, color: ink.primary, padding: 0 },
});

export interface SearchBarProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}

/** Hood search field (reference screen 12). Editing it opens the keyboard. */
export function SearchBar({ value, onChange, placeholder = 'Search hoods' }: SearchBarProps): React.JSX.Element {
  const inputRef = React.useRef<TextInput>(null);
  return (
    <Pressable
      onPress={() => {
        hapticTap();
        inputRef.current?.focus();
      }}
      accessibilityRole="search"
      accessibilityLabel={placeholder}
      style={styles.shell}
    >
      <SearchIcon size={16} color={ink.tertiary} strokeWidth={2.4} />
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="rgba(247,247,250,0.38)"
        accessibilityLabel={placeholder}
        returnKeyType="search"
        style={styles.input}
      />
      {value.length > 0 ? (
        <IconButton
          icon={CloseIcon}
          onPress={() => onChange('')}
          label="Clear search"
          size={28}
        />
      ) : null}
    </Pressable>
  );
}