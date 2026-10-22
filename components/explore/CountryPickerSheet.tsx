/**
 * Accessible country selector — the globe is never the only path.
 *
 * Explore E2.8:
 * - D4 sized from the measured modal surface + safe-area insets, never a
 *   percentage cap, so the last row cannot be clipped by the navigation bar.
 * - D5 a closed sheet forgets its search, including the filtered results.
 * - D8 lifted above the IME (via `usePickerViewport`), so field, results and the
 *   close control stay usable while typing.
 */
import React from 'react';
import { FlatList, Modal, Pressable, Text, TextInput, View } from 'react-native';

import { type ExploreCountry } from '../../data/exploreCountries';
import { usePickerViewport } from '../../hooks/usePickerViewport';
import { space, useThemeColors } from '../../theme';
import type { WorldCountryActivity } from '../../utils/exploreWorldModel';
import { pickerQueryAfterVisibility, pickerSections } from '../../utils/explorePickerModel';
import { tap as hapticTap } from '../../utils/haptics';
import { CloseIcon } from '../shared/icons';
import { CountryPickerListHeader } from './CountryPickerListHeader';
import { CountryPickerRow } from './CountryPickerRow';
import { countryPickerStyles as styles } from './countryPickerStyles';

export interface CountryPickerSheetProps {
  visible: boolean;
  recentCodes?: readonly string[];
  active?: readonly WorldCountryActivity[];
  onClose: () => void;
  onSelect: (code: string) => void;
}

export function CountryPickerSheet({
  visible,
  recentCodes = [],
  active = [],
  onClose,
  onSelect,
}: CountryPickerSheetProps): React.JSX.Element {
  const t = useThemeColors();
  const { sheetHeight, lift, bottomPad, onSurfaceLayout } = usePickerViewport(visible);
  const [query, setQuery] = React.useState('');

  // D5 — a hidden sheet forgets the search, and with it the filtered results.
  React.useEffect(() => {
    if (visible) return;
    setQuery((current) => pickerQueryAfterVisibility(current, false));
  }, [visible]);

  const sections = React.useMemo(
    () => pickerSections({ query, recentCodes, active }),
    [active, query, recentCodes],
  );

  const pick = (code: string): void => {
    hapticTap();
    onSelect(code);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={[styles.backdrop, { paddingBottom: lift }]}
        onPress={onClose}
        onLayout={onSurfaceLayout}
        accessibilityRole="button"
      >
        <Pressable
          style={[
            styles.sheet,
            {
              height: sheetHeight,
              paddingBottom: bottomPad,
              backgroundColor: t.surfaceElevated,
              borderColor: t.border,
            },
          ]}
          onPress={() => undefined}
          accessibilityViewIsModal
          accessibilityLabel="Choose a country"
        >
          <View style={styles.head}>
            <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
              Countries
            </Text>
            <Pressable
              onPress={onClose}
              style={styles.close}
              accessibilityRole="button"
              accessibilityLabel="Close country picker"
            >
              <CloseIcon size={18} color={t.textPrimary} />
            </Pressable>
          </View>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="India, Japan, Brazil…"
            placeholderTextColor={t.textMuted}
            style={[
              styles.input,
              { color: t.textPrimary, borderColor: t.border, backgroundColor: t.surface },
            ]}
            autoFocus
            accessibilityLabel="Search countries"
          />
          <FlatList
            data={sections.results as ExploreCountry[]}
            keyExtractor={(item) => item.code}
            keyboardShouldPersistTaps="handled"
            style={styles.list}
            contentContainerStyle={{ paddingBottom: space.xs }}
            ListHeaderComponent={
              sections.searching ? null : (
                <CountryPickerListHeader
                  recent={sections.recent}
                  activeList={sections.activeList}
                  onSelect={pick}
                />
              )
            }
            renderItem={({ item }) => (
              <CountryPickerRow
                name={item.name}
                meta={item.code}
                onPress={() => pick(item.code)}
                accessibilityLabel={item.name}
              />
            )}
            ListEmptyComponent={
              sections.searching ? (
                <Text style={[styles.empty, { color: t.textMuted }]}>
                  {`No country matches “${query.trim()}”.`}
                </Text>
              ) : null
            }
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
