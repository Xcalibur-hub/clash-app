/**
 * Accessible country selector — the globe is never the only path.
 *
 * Countries with real eligible engagement lead (server order), then the curated
 * catalogue order. Search always spans every country, so a quiet place is still
 * one tap away.
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
import {
  orderCountriesByEngagement,
  type WorldCountryActivity,
} from '../../utils/exploreWorldModel';
import { tap as hapticTap } from '../../utils/haptics';
import { CloseIcon } from '../shared/icons';

const MAX_RESULTS = 40;
const MAX_ACTIVE = 6;

export interface CountryPickerSheetProps {
  visible: boolean;
  recentCodes?: readonly string[];
  active?: readonly WorldCountryActivity[];
  onClose: () => void;
  onSelect: (code: string) => void;
}

function PickerRow({
  name,
  meta,
  onPress,
  accessibilityLabel,
}: {
  name: string;
  meta: string | null;
  onPress: () => void;
  accessibilityLabel: string;
}): React.JSX.Element {
  const t = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      style={styles.row}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Text numberOfLines={1} style={[styles.name, { color: t.textPrimary }]}>
        {name}
      </Text>
      {meta ? (
        <Text allowFontScaling={false} style={[styles.code, { color: t.textMuted }]}>
          {meta}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function CountryPickerSheet({
  visible,
  recentCodes = [],
  active = [],
  onClose,
  onSelect,
}: CountryPickerSheetProps): React.JSX.Element {
  const t = useThemeColors();
  const [query, setQuery] = React.useState('');
  const searching = query.trim().length > 0;
  const activeList = React.useMemo(() => active.slice(0, MAX_ACTIVE), [active]);
  const activeCodes = React.useMemo(
    () => activeList.map((country) => country.code),
    [activeList],
  );
  const counts = React.useMemo(
    () => new Map(activeList.map((country) => [country.code, country.activityCount])),
    [activeList],
  );

  const results = React.useMemo(() => {
    const found = searchCountries(query, 60);
    const pool = searching ? found : found.filter((country) => !counts.has(country.code));
    return orderCountriesByEngagement(pool, activeCodes).slice(0, MAX_RESULTS);
  }, [activeCodes, counts, query, searching]);

  const recent = React.useMemo(
    () =>
      recentCodes
        .map((code) => EXPLORE_COUNTRIES.find((c) => c.code === code))
        .filter((c): c is (typeof EXPLORE_COUNTRIES)[number] => Boolean(c)),
    [recentCodes],
  );

  const pick = (code: string): void => {
    hapticTap();
    onSelect(code);
  };

  const section = (label: string, hint: string | null): React.JSX.Element => (
    <View style={styles.sectionHead}>
      <Text allowFontScaling={false} style={[styles.section, { color: t.textMuted }]}>
        {label}
      </Text>
      {hint ? (
        <Text allowFontScaling={false} style={[styles.section, { color: t.textMuted }]}>
          {hint}
        </Text>
      ) : null}
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button">
        <Pressable
          style={[styles.sheet, { backgroundColor: t.surfaceElevated, borderColor: t.border }]}
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
            data={results}
            keyExtractor={(item) => item.code}
            keyboardShouldPersistTaps="handled"
            style={styles.list}
            ListHeaderComponent={
              searching ? null : (
                <View style={styles.headerBlock}>
                  {recent.length > 0 ? (
                    <View>
                      {section('Recent', null)}
                      {recent.map((country) => (
                        <PickerRow
                          key={`r-${country.code}`}
                          name={country.name}
                          meta={country.code}
                          onPress={() => pick(country.code)}
                          accessibilityLabel={country.name}
                        />
                      ))}
                    </View>
                  ) : null}
                  {activeList.length > 0 ? (
                    <View>
                      {section('Happening now', 'Public profiles')}
                      {activeList.map((country) => (
                        <PickerRow
                          key={`a-${country.code}`}
                          name={country.name}
                          meta={
                            country.activityCount == null
                              ? null
                              : country.activityCount.toLocaleString()
                          }
                          onPress={() => pick(country.code)}
                          accessibilityLabel={
                            country.activityCount == null
                              ? `${country.name}, quiet right now`
                              : `${country.name}, ${country.activityCount.toLocaleString()} public profiles`
                          }
                        />
                      ))}
                    </View>
                  ) : null}
                  {section('All countries', null)}
                </View>
              )
            }
            renderItem={({ item }) => (
              <PickerRow
                name={item.name}
                meta={item.code}
                onPress={() => pick(item.code)}
                accessibilityLabel={item.name}
              />
            )}
            ListEmptyComponent={
              searching ? (
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
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...typeScale.section, fontSize: 20, fontWeight: '800' },
  close: {
    width: layout.hit,
    height: layout.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    minHeight: 48,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.md,
    ...typeScale.body,
    fontSize: 16,
  },
  headerBlock: { gap: space.xs },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.xs,
  },
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
  name: { ...typeScale.label, fontSize: 16, fontWeight: '700', flexShrink: 1 },
  code: { ...typeScale.caption, fontSize: 12, fontWeight: '700' },
  empty: { ...typeScale.caption, fontSize: 13, paddingVertical: space.md },
});
