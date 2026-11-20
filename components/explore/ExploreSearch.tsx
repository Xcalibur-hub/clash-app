import React from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { radius, typeScale, useThemeColors } from '../../theme';
import { CloseIcon, SearchIcon } from '../shared/icons';
import { tap as hapticTap } from '../../utils/haptics';

export interface ExploreSearchProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  /** Compact floating header variant. */
  compact?: boolean;
}

/** Theme-aware Explore search — soft elevated surface in Light, lifted near-black in Dark. */
export function ExploreSearch({
  value,
  onChange,
  placeholder = 'Search the world…',
  compact = false,
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
        compact && styles.shellCompact,
        {
          backgroundColor: t.scheme === 'light' ? '#FFFEFA' : t.surface,
          borderColor: focused ? t.borderStrong : t.border,
          shadowColor: t.shadowColor,
          shadowOpacity: t.scheme === 'light' ? (focused ? 0.1 : 0.06) : 0,
        },
      ]}
    >
      <SearchIcon size={compact ? 15 : 17} color={t.textMuted} strokeWidth={2.3} />
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
        style={[styles.input, compact && styles.inputCompact, { color: t.textPrimary }]}
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
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: radius.xxl,
    borderWidth: StyleSheet.hairlineWidth,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  shellCompact: {
    minHeight: 42,
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    ...typeScale.body,
    fontSize: 15,
    paddingVertical: 10,
    paddingHorizontal: 0,
  },
  inputCompact: {
    fontSize: 14,
    paddingVertical: 8,
  },
  clear: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
