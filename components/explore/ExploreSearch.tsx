import React from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { radius, typeScale, useThemeColors } from '../../theme';
import { CloseIcon, SearchIcon } from '../shared/icons';
import { tap as hapticTap } from '../../utils/haptics';

export interface ExploreSearchProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}

/** Theme-aware Explore search — soft elevated surface in Light, lifted near-black in Dark. */
export function ExploreSearch({
  value,
  onChange,
  placeholder = 'Search Hoods, Takes, people…',
}: ExploreSearchProps): React.JSX.Element {
  const t = useThemeColors();
  const inputRef = React.useRef<TextInput>(null);
  const [focused, setFocused] = React.useState(false);

  return (
    <Pressable
      onPress={() => {
        hapticTap();
        inputRef.current?.focus();
      }}
      accessibilityRole="search"
      accessibilityLabel={placeholder}
      style={[
        styles.shell,
        {
          backgroundColor: t.surface,
          borderColor: focused ? t.borderStrong : t.border,
          shadowColor: t.shadowColor,
          shadowOpacity: t.scheme === 'light' ? (focused ? 0.1 : 0.06) : 0,
        },
      ]}
    >
      <SearchIcon size={17} color={t.textMuted} strokeWidth={2.3} />
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={t.textMuted}
        accessibilityLabel={placeholder}
        returnKeyType="search"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[styles.input, { color: t.textPrimary }]}
      />
      {value.length > 0 ? (
        <Pressable
          onPress={() => {
            hapticTap();
            onChange('');
          }}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          hitSlop={8}
          style={[styles.clear, { backgroundColor: t.surfaceMuted }]}
        >
          <CloseIcon size={14} color={t.textSecondary} strokeWidth={2.4} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 50,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  input: {
    flex: 1,
    ...typeScale.body,
    fontSize: 15,
    paddingVertical: 12,
    paddingHorizontal: 0,
  },
  clear: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
