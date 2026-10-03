/**
 * Accessible country selector — globe is never the only path.
 */
import React from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { EXPLORE_COUNTRIES, searchCountries } from '../../data/exploreCountries';
import { layout, radius, space, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';

export interface CountryPickerSheetProps {
  visible: boolean;
  recentCodes?: readonly string[];
  onClose: () => void;
  onSelect: (code: string) => void;
}

export function CountryPickerSheet({
  visible,
  recentCodes = [],
  onClose,
  onSelect,
}: CountryPickerSheetProps): React.JSX.Element {
  const t = useThemeColors();
  const [query, setQuery] = React.useState('');
  const results = React.useMemo(() => searchCountries(query, 40), [query]);
  const recent = React.useMemo(
    () =>
      recentCodes
        .map((code) => EXPLORE_COUNTRIES.find((c) => c.code === code))
        .filter((c): c is (typeof EXPLORE_COUNTRIES)[number] => Boolean(c)),
    [recentCodes],
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button">
        <Pressable
          style={[styles.sheet, { backgroundColor: t.surfaceElevated, borderColor: t.border }]}
          onPress={() => undefined}
          accessibilityViewIsModal
          accessibilityLabel="Search countries"
        >
          <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
            Search countries
          </Text>
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
          {recent.length > 0 && query.trim().length === 0 ? (
            <View style={styles.recent}>
              <Text allowFontScaling={false} style={[styles.section, { color: t.textMuted }]}>
                Recent
              </Text>
              {recent.map((country) => (
                <Pressable
                  key={`r-${country.code}`}
                  onPress={() => {
                    hapticTap();
                    onSelect(country.code);
                  }}
                  style={styles.row}
                  accessibilityRole="button"
                  accessibilityLabel={country.name}
                >
                  <Text allowFontScaling={false} style={[styles.name, { color: t.textPrimary }]}>
                    {country.name}
                  </Text>
                  <Text allowFontScaling={false} style={[styles.code, { color: t.textMuted }]}>
                    {country.code}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <FlatList
            data={results}
            keyExtractor={(item) => item.code}
            keyboardShouldPersistTaps="handled"
            style={styles.list}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  hapticTap();
                  onSelect(item.code);
                }}
                style={styles.row}
                accessibilityRole="button"
                accessibilityLabel={item.name}
              >
                <Text allowFontScaling={false} style={[styles.name, { color: t.textPrimary }]}>
                  {item.name}
                </Text>
                <Text allowFontScaling={false} style={[styles.code, { color: t.textMuted }]}>
                  {item.code}
                </Text>
              </Pressable>
            )}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(8,8,11,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '78%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: layout.screenX,
    paddingTop: space.lg,
    paddingBottom: space.xxl,
    gap: space.sm,
  },
  title: { ...typeScale.section, fontSize: 20, fontWeight: '800' },
  input: {
    minHeight: 48,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.md,
    ...typeScale.body,
    fontSize: 16,
  },
  recent: { gap: 2 },
  section: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  list: { flexGrow: 0 },
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  name: { ...typeScale.label, fontSize: 16, fontWeight: '700' },
  code: { ...typeScale.caption, fontSize: 12, fontWeight: '700' },
});
