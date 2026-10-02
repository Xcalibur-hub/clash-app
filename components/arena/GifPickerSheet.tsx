/**
 * Premium GIF picker — bottom sheet, search, 2-column grid.
 * Trending/featured when search is empty. No search-query analytics payloads.
 */
import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type ListRenderItemInfo,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { analytics } from '../../services/analytics';
import {
  fetchFeaturedGifs,
  isGifSearchConfigured,
  searchGifs,
  type TenorGif,
} from '../../services/tenorService';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';
import { CloseIcon, SearchIcon } from '../shared/icons';

export interface GifPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (gif: TenorGif) => void;
  source?: 'take' | 'comment';
}

type LoadState = 'loading' | 'ready' | 'empty' | 'error' | 'unconfigured';

export function GifPickerSheet({
  visible,
  onClose,
  onSelect,
  source = 'take',
}: GifPickerSheetProps): React.JSX.Element {
  const t = useThemeColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [query, setQuery] = React.useState('');
  const debounced = useDebouncedValue(query, 320);
  const [results, setResults] = React.useState<TenorGif[]>([]);
  const [next, setNext] = React.useState<string | null>(null);
  const [state, setState] = React.useState<LoadState>('loading');
  const [error, setError] = React.useState<string | null>(null);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const openedRef = React.useRef(false);

  const gap = 8;
  const pad = space.md;
  const col = Math.max(140, Math.floor((width - pad * 2 - gap) / 2));

  const load = React.useCallback(async (q: string, pos?: string, append = false) => {
    if (!isGifSearchConfigured()) {
      setState('unconfigured');
      setResults([]);
      return;
    }
    if (!append) {
      setState('loading');
      setError(null);
    } else {
      setLoadingMore(true);
    }
    try {
      const page = q.trim() ? await searchGifs(q, pos) : await fetchFeaturedGifs(pos);
      setResults((prev) => (append ? [...prev, ...page.results] : page.results));
      setNext(page.next);
      setState(page.results.length === 0 && !append ? 'empty' : 'ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'GIF provider unavailable.');
      if (!append) {
        setResults([]);
        setState('error');
      }
    } finally {
      setLoadingMore(false);
    }
  }, []);

  React.useEffect(() => {
    if (!visible) {
      openedRef.current = false;
      return;
    }
    if (!openedRef.current) {
      openedRef.current = true;
      analytics.track('gif_picker_opened', {
        realm: 'arena',
        source,
        media_type: 'gif',
      });
      setQuery('');
    }
  }, [visible, source]);

  React.useEffect(() => {
    if (!visible) return;
    void load(debounced);
  }, [visible, debounced, load]);

  const select = (gif: TenorGif): void => {
    hapticTap();
    onSelect(gif);
    onClose();
  };

  const renderItem = ({ item }: ListRenderItemInfo<TenorGif>): React.JSX.Element => {
    const ratio = item.width > 0 && item.height > 0 ? item.width / item.height : 1;
    return (
      <Pressable
        onPress={() => select(item)}
        accessibilityRole="button"
        accessibilityLabel={item.description || 'Select GIF'}
        style={[styles.cell, { width: col, backgroundColor: t.surfaceMuted }]}
      >
        <Image
          source={{ uri: item.previewUrl }}
          style={{ width: col, aspectRatio: Math.min(1.4, Math.max(0.7, ratio)) }}
          resizeMode="cover"
        />
      </Pressable>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={[styles.scrim, { backgroundColor: t.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close GIF picker" />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: t.surfaceElevated,
              borderColor: t.border,
              paddingBottom: Math.max(insets.bottom, space.md),
            },
          ]}
          onStartShouldSetResponder={() => true}
          accessibilityViewIsModal
        >
          <View style={styles.handleRow}>
            <View style={[styles.handle, { backgroundColor: t.borderStrong }]} />
          </View>
          <View style={styles.titleRow}>
            <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
              GIFs
            </Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
              <CloseIcon size={20} color={t.textMuted} strokeWidth={2.2} />
            </Pressable>
          </View>

          <View style={[styles.search, { backgroundColor: t.inputBackground, borderColor: t.border }]}>
            <SearchIcon size={16} color={t.textMuted} strokeWidth={2} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={debounced.trim() ? 'Search GIFs' : 'Search or browse trending'}
              placeholderTextColor={t.textMuted}
              style={[styles.searchInput, { color: t.textPrimary }]}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              accessibilityLabel="Search GIFs"
            />
          </View>

          {state === 'unconfigured' ? (
            <View style={styles.message}>
              <Text allowFontScaling={false} style={[styles.messageTitle, { color: t.textPrimary }]}>
                GIF search needs a key
              </Text>
              <Text allowFontScaling={false} style={[styles.messageBody, { color: t.textMuted }]}>
                Set EXPO_PUBLIC_TENOR_API_KEY in your env to enable Tenor.
              </Text>
            </View>
          ) : state === 'loading' && results.length === 0 ? (
            <View style={styles.message}>
              <ActivityIndicator color={t.textMuted} />
            </View>
          ) : state === 'error' ? (
            <View style={styles.message}>
              <Text allowFontScaling={false} style={[styles.messageTitle, { color: t.textPrimary }]}>
                Couldn't load GIFs
              </Text>
              <Text allowFontScaling={false} style={[styles.messageBody, { color: t.textMuted }]}>
                {error}
              </Text>
              <Pressable
                onPress={() => {
                  void load(debounced);
                }}
                style={[styles.retry, { backgroundColor: t.clashFill }]}
              >
                <Text allowFontScaling={false} style={[styles.retryText, { color: t.clashText }]}>
                  Retry
                </Text>
              </Pressable>
            </View>
          ) : state === 'empty' ? (
            <View style={styles.message}>
              <Text allowFontScaling={false} style={[styles.messageTitle, { color: t.textPrimary }]}>
                No GIFs found
              </Text>
              <Text allowFontScaling={false} style={[styles.messageBody, { color: t.textMuted }]}>
                Try a different search.
              </Text>
            </View>
          ) : (
            <FlatList
              data={results}
              keyExtractor={(item) => item.id}
              numColumns={2}
              columnWrapperStyle={{ gap, paddingHorizontal: pad }}
              contentContainerStyle={{ gap, paddingBottom: space.lg }}
              renderItem={renderItem}
              keyboardShouldPersistTaps="handled"
              onEndReached={() => {
                if (!next || loadingMore || state !== 'ready') return;
                void load(debounced, next, true);
              }}
              onEndReachedThreshold={0.4}
              ListFooterComponent={
                loadingMore ? (
                  <ActivityIndicator style={{ marginVertical: space.md }} color={t.textMuted} />
                ) : (
                  <Text allowFontScaling={false} style={[styles.credit, { color: t.textMuted }]}>
                    Via Tenor
                  </Text>
                )
              }
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '82%',
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  handleRow: { alignItems: 'center', paddingTop: 10, paddingBottom: 4 },
  handle: { width: 36, height: 4, borderRadius: 2 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
  },
  title: { ...typeScale.title, fontSize: 20, fontWeight: '700' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: space.md,
    marginBottom: space.md,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    minHeight: 44,
  },
  searchInput: { flex: 1, ...typeScale.body, fontSize: 15, paddingVertical: 8 },
  cell: {
    borderRadius: radius.md,
    overflow: 'hidden',
    marginBottom: 0,
  },
  message: {
    paddingHorizontal: space.lg,
    paddingVertical: space.xxl,
    alignItems: 'center',
    gap: space.sm,
  },
  messageTitle: { ...typeScale.label, fontSize: 16, fontWeight: '700' },
  messageBody: { ...typeScale.body, fontSize: 14, textAlign: 'center' },
  retry: {
    marginTop: space.sm,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  retryText: { ...typeScale.label, fontWeight: '800', fontSize: 13 },
  credit: {
    ...typeScale.caption,
    textAlign: 'center',
    paddingVertical: space.sm,
    fontSize: 11,
  },
});
