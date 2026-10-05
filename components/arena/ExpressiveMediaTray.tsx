/**
 * Unified memes / GIFs / stickers tray — search, trending, recent, saved.
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
  listSavedExpressiveMedia,
  listTrendingClashMemes,
  toggleSavedExpressiveMedia,
  type SavedExpressiveMedia,
  type TrendingClashMeme,
} from '../../services/expressiveMediaService';
import { getGifProvider, type NormalizedGifMedia } from '../../services/gif';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import {
  pushExpressiveRecent,
  readExpressiveRecent,
  type ExpressiveRecentItem,
} from '../../utils/expressiveMediaRecent';
import { tap as hapticTap } from '../../utils/haptics';
import { CLASH_NATIVE_STICKERS, clashStickerAsGif } from '../../utils/clashNativeStickers';
import { CloseIcon, SearchIcon } from '../shared/icons';

export type ExpressiveMainTab = 'memes' | 'gifs' | 'stickers';
export type ExpressiveSubTab = 'search' | 'trending' | 'recent' | 'saved';

export type ExpressiveMediaPick =
  | { channel: 'gif' | 'sticker'; media: NormalizedGifMedia }
  | { channel: 'meme'; upload: true }
  | {
      channel: 'meme';
      media?: NormalizedGifMedia;
      trending?: TrendingClashMeme;
      saved?: SavedExpressiveMedia;
    };

export interface ExpressiveMediaTrayProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (pick: ExpressiveMediaPick) => void;
  initialMainTab?: ExpressiveMainTab;
  /** Take thread vs live room — analytics only. */
  source?: 'take' | 'comment' | 'room';
}

type GridItem =
  | { key: string; kind: 'gif'; media: NormalizedGifMedia }
  | { key: string; kind: 'meme-upload' }
  | { key: string; kind: 'trending'; meme: TrendingClashMeme }
  | { key: string; kind: 'saved'; saved: SavedExpressiveMedia }
  | { key: string; kind: 'recent'; recent: ExpressiveRecentItem };

type LoadState = 'loading' | 'ready' | 'empty' | 'error' | 'unconfigured';

const PAGE = 24;

export function ExpressiveMediaTray({
  visible,
  onClose,
  onSelect,
  initialMainTab = 'gifs',
  source = 'comment',
}: ExpressiveMediaTrayProps): React.JSX.Element {
  const t = useThemeColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const provider = React.useMemo(() => getGifProvider(), []);

  const [mainTab, setMainTab] = React.useState<ExpressiveMainTab>(initialMainTab);
  const [subTab, setSubTab] = React.useState<ExpressiveSubTab>('trending');
  const [query, setQuery] = React.useState('');
  const debounced = useDebouncedValue(query, 320);

  const [gifItems, setGifItems] = React.useState<NormalizedGifMedia[]>([]);
  const [gifNext, setGifNext] = React.useState<string | null>(null);
  const [gifState, setGifState] = React.useState<LoadState>('loading');
  const [loadingMore, setLoadingMore] = React.useState(false);

  const [recent, setRecent] = React.useState<ExpressiveRecentItem[]>([]);
  const [saved, setSaved] = React.useState<SavedExpressiveMedia[]>([]);
  const [trendingMemes, setTrendingMemes] = React.useState<TrendingClashMeme[]>([]);
  const [auxState, setAuxState] = React.useState<LoadState>('loading');

  const gap = 8;
  const pad = space.md;
  const col = Math.max(108, Math.floor((width - pad * 2 - gap * 2) / 3));

  React.useEffect(() => {
    if (!visible) return;
    setMainTab(initialMainTab);
    setSubTab(initialMainTab === 'memes' ? 'trending' : 'trending');
    void readExpressiveRecent().then(setRecent);
    analytics.track('gif_picker_opened', { realm: 'arena', source });
  }, [visible, initialMainTab, source]);

  const loadGifs = React.useCallback(
    async (append: boolean, pos?: string) => {
      if (!provider.isConfigured()) {
        setGifState('unconfigured');
        setGifItems([]);
        return;
      }
      if (!append) {
        setGifState('loading');
      } else {
        setLoadingMore(true);
      }
      try {
        const q = debounced.trim();
        const useSearch = subTab === 'search' && q.length > 0;
        const page =
          mainTab === 'stickers'
            ? await provider.stickers(pos)
            : useSearch
              ? await provider.search(q, pos)
              : await provider.trending(pos);
        setGifItems((prev) => (append ? [...prev, ...page.results] : page.results));
        setGifNext(page.next);
        setGifState(page.results.length === 0 && !append ? 'empty' : 'ready');
      } catch {
        if (!append) setGifState('error');
      } finally {
        setLoadingMore(false);
      }
    },
    [debounced, mainTab, provider, subTab],
  );

  const loadAux = React.useCallback(async () => {
    setAuxState('loading');
    try {
      if (subTab === 'saved') {
        const rows = await listSavedExpressiveMedia(PAGE);
        setSaved(rows);
        setAuxState(rows.length ? 'ready' : 'empty');
        return;
      }
      if (subTab === 'recent') {
        const rows = await readExpressiveRecent();
        setRecent(rows);
        setAuxState(rows.length ? 'ready' : 'empty');
        return;
      }
      if (mainTab === 'memes' && subTab === 'trending') {
        const rows = await listTrendingClashMemes(PAGE);
        setTrendingMemes(rows);
        setAuxState(rows.length ? 'ready' : 'empty');
        return;
      }
      setAuxState('ready');
    } catch {
      setAuxState('error');
    }
  }, [mainTab, subTab]);

  React.useEffect(() => {
    if (!visible) return;
    if (mainTab === 'gifs' || mainTab === 'stickers') {
      if (subTab === 'search' || subTab === 'trending') {
        void loadGifs(false);
      } else {
        void loadAux();
      }
    } else if (mainTab === 'memes') {
      if (subTab === 'trending' || subTab === 'saved' || subTab === 'recent') {
        void loadAux();
      } else if (subTab === 'search') {
        void loadGifs(false);
      }
    }
  }, [visible, mainTab, subTab, debounced, loadAux, loadGifs]);

  const gridData = React.useMemo((): GridItem[] => {
    if (mainTab === 'memes') {
      if (subTab === 'trending') {
        return [
          { key: 'upload', kind: 'meme-upload' },
          ...trendingMemes.map((meme) => ({ key: meme.messageId, kind: 'trending' as const, meme })),
        ];
      }
      if (subTab === 'saved') {
        return saved
          .filter((s) => s.kind === 'meme' || s.kind === 'gif')
          .map((savedRow) => ({ key: savedRow.id, kind: 'saved' as const, saved: savedRow }));
      }
      if (subTab === 'recent') {
        return recent
          .filter((r) => r.kind === 'meme' || r.kind === 'gif')
          .map((recentRow) => ({ key: dedupeRecent(recentRow), kind: 'recent' as const, recent: recentRow }));
      }
      if (subTab === 'search') {
        return gifItems.map((media) => ({ key: `g-${media.id}`, kind: 'gif' as const, media }));
      }
      return [{ key: 'upload', kind: 'meme-upload' }];
    }
    if (mainTab === 'stickers') {
      const native = CLASH_NATIVE_STICKERS.map((s) => clashStickerAsGif(s));
      const fromProvider =
        subTab === 'search' || subTab === 'trending'
          ? gifItems
          : subTab === 'recent'
            ? recent.filter((r) => r.kind === 'sticker').map(recentToGif)
            : saved.filter((s) => s.kind === 'sticker').map(savedToGif);
      const merged = [...native, ...fromProvider];
      return merged.map((media) => ({ key: `s-${media.provider}-${media.id}`, kind: 'gif' as const, media }));
    }
    // gifs
    if (subTab === 'saved') {
      return saved
        .filter((s) => s.kind === 'gif')
        .map((savedRow) => ({ key: savedRow.id, kind: 'saved' as const, saved: savedRow }));
    }
    if (subTab === 'recent') {
      return recent
        .filter((r) => r.kind === 'gif')
        .map((recentRow) => ({ key: dedupeRecent(recentRow), kind: 'recent' as const, recent: recentRow }));
    }
    return gifItems.map((media) => ({ key: `g-${media.id}`, kind: 'gif' as const, media }));
  }, [gifItems, mainTab, recent, saved, subTab, trendingMemes]);

  const pickGif = async (media: NormalizedGifMedia, kind: 'gif' | 'sticker'): Promise<void> => {
    hapticTap();
    await pushExpressiveRecent({
      kind,
      provider: media.provider,
      externalId: media.id,
      previewUrl: media.previewUrl,
      url: media.url,
    });
    onSelect({ channel: kind, media });
    onClose();
  };

  const onGridPress = async (item: GridItem): Promise<void> => {
    if (item.kind === 'meme-upload') {
      hapticTap();
      onSelect({ channel: 'meme', upload: true });
      onClose();
      return;
    }
    if (item.kind === 'gif') {
      await pickGif(item.media, mainTab === 'stickers' ? 'sticker' : 'gif');
      return;
    }
    if (item.kind === 'trending') {
      hapticTap();
      onSelect({ channel: 'meme', trending: item.meme });
      onClose();
      return;
    }
    if (item.kind === 'saved') {
      hapticTap();
      const s = item.saved;
      if (s.kind === 'gif' || s.kind === 'sticker') {
        await pickGif(
          {
            id: s.externalId,
            provider: 'tenor',
            previewUrl: s.previewUrl,
            url: s.mediaUrl,
            width: 1,
            height: 1,
            description: '',
          },
          s.kind === 'sticker' ? 'sticker' : 'gif',
        );
        return;
      }
      onSelect({ channel: 'meme', saved: s });
      onClose();
      return;
    }
    if (item.kind === 'recent') {
      const r = item.recent;
      if (r.kind === 'gif' || r.kind === 'sticker') {
        await pickGif(
          {
            id: r.externalId,
            provider: 'tenor',
            previewUrl: r.previewUrl,
            url: r.url,
            width: 1,
            height: 1,
            description: '',
          },
          r.kind === 'sticker' ? 'sticker' : 'gif',
        );
        return;
      }
      onSelect({
        channel: 'meme',
        media: {
          id: r.externalId,
          provider: 'tenor',
          previewUrl: r.previewUrl,
          url: r.url,
          width: 1,
          height: 1,
          description: '',
        },
      });
      onClose();
    }
  };

  const renderItem = ({ item }: ListRenderItemInfo<GridItem>): React.JSX.Element => {
    if (item.kind === 'meme-upload') {
      return (
        <Pressable
          onPress={() => void onGridPress(item)}
          style={[styles.tile, styles.uploadTile, { width: col, height: col, borderColor: t.border }]}
          accessibilityRole="button"
          accessibilityLabel="Upload meme image"
        >
          <Text allowFontScaling={false} style={[styles.uploadText, { color: t.textSecondary }]}>
            + Upload
          </Text>
        </Pressable>
      );
    }
    const uri =
      item.kind === 'trending'
        ? item.meme.previewUrl
        : item.kind === 'saved'
          ? item.saved.previewUrl
          : item.kind === 'recent'
            ? item.recent.previewUrl
            : item.media.previewUrl;
    return (
      <Pressable
        onPress={() => void onGridPress(item)}
        onLongPress={() => void toggleSaveFromItem(item)}
        style={[styles.tile, { width: col, height: col, backgroundColor: t.surfaceMuted }]}
        accessibilityRole="button"
        accessibilityLabel="Select media"
      >
        <Image source={{ uri }} style={styles.thumb} resizeMode="cover" />
      </Pressable>
    );
  };

  const state: LoadState =
    mainTab === 'memes' && (subTab === 'trending' || subTab === 'saved' || subTab === 'recent')
      ? auxState
      : gifState;

  const showSearch = subTab === 'search';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: t.background, paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
            Express
          </Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
            <CloseIcon size={22} color={t.textSecondary} strokeWidth={2} />
          </Pressable>
        </View>

        <View style={styles.mainTabs}>
          {(['memes', 'gifs', 'stickers'] as const).map((tab) => (
            <Pressable
              key={tab}
              onPress={() => {
                hapticTap();
                setMainTab(tab);
                setSubTab(tab === 'memes' ? 'trending' : 'trending');
              }}
              style={[styles.mainTab, mainTab === tab && { borderBottomColor: t.accent }]}
            >
              <Text
                allowFontScaling={false}
                style={[
                  styles.mainTabText,
                  { color: mainTab === tab ? t.textPrimary : t.textMuted },
                ]}
              >
                {tab.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.subTabs}>
          {(['search', 'trending', 'recent', 'saved'] as const).map((tab) => (
            <Pressable
              key={tab}
              onPress={() => {
                hapticTap();
                setSubTab(tab);
              }}
              style={[styles.subChip, { backgroundColor: subTab === tab ? t.surfaceMuted : 'transparent' }]}
            >
              <Text
                allowFontScaling={false}
                style={[styles.subChipText, { color: subTab === tab ? t.textPrimary : t.textMuted }]}
              >
                {tab[0].toUpperCase() + tab.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>

        {showSearch ? (
          <View style={[styles.search, { backgroundColor: t.surfaceElevated, borderColor: t.border }]}>
            <SearchIcon size={16} color={t.textMuted} strokeWidth={2} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={mainTab === 'stickers' ? 'Search stickers…' : 'Search GIFs…'}
              placeholderTextColor={t.textMuted}
              style={[styles.searchInput, { color: t.textPrimary }]}
              autoCorrect={false}
              returnKeyType="search"
            />
          </View>
        ) : null}

        {state === 'loading' ? (
          <View style={styles.center}>
            <ActivityIndicator color={t.textMuted} />
          </View>
        ) : state === 'unconfigured' ? (
          <View style={styles.center}>
            <Text allowFontScaling={false} style={{ color: t.textMuted, textAlign: 'center' }}>
              GIF search is not configured. Add EXPO_PUBLIC_TENOR_API_KEY for this build.
            </Text>
          </View>
        ) : state === 'empty' ? (
          <View style={styles.center}>
            <Text allowFontScaling={false} style={{ color: t.textMuted }}>
              Nothing here yet — try search or send one first.
            </Text>
          </View>
        ) : state === 'error' ? (
          <View style={styles.center}>
            <Text allowFontScaling={false} style={{ color: t.textMuted }}>
              Could not load media. Try again.
            </Text>
          </View>
        ) : (
          <FlatList
            data={gridData}
            keyExtractor={(item) => item.key}
            numColumns={3}
            columnWrapperStyle={{ gap, paddingHorizontal: pad }}
            contentContainerStyle={{ gap, paddingBottom: insets.bottom + space.lg }}
            renderItem={renderItem}
            onEndReached={() => {
              if ((mainTab === 'gifs' || mainTab === 'stickers') && gifNext && !loadingMore) {
                void loadGifs(true, gifNext);
              }
            }}
            onEndReachedThreshold={0.4}
            initialNumToRender={12}
            maxToRenderPerBatch={12}
            windowSize={5}
            removeClippedSubviews
          />
        )}
        <Text allowFontScaling={false} style={[styles.attribution, { color: t.textMuted }]}>
          GIFs via Tenor · CLASH memes from the Arena
        </Text>
      </View>
    </Modal>
  );
}

function dedupeRecent(r: ExpressiveRecentItem): string {
  return `${r.kind}:${r.provider}:${r.externalId}`;
}

function recentToGif(r: ExpressiveRecentItem): NormalizedGifMedia {
  return {
    id: r.externalId,
    provider: 'tenor',
    previewUrl: r.previewUrl,
    url: r.url,
    width: 1,
    height: 1,
    description: '',
  };
}

function savedToGif(s: SavedExpressiveMedia): NormalizedGifMedia {
  return {
    id: s.externalId,
    provider: 'tenor',
    previewUrl: s.previewUrl,
    url: s.mediaUrl,
    width: 1,
    height: 1,
    description: '',
  };
}

async function toggleSaveFromItem(item: GridItem): Promise<void> {
  hapticTap();
  try {
    if (item.kind === 'gif') {
      const m = item.media;
      await toggleSavedExpressiveMedia({
        kind: 'gif',
        provider: m.provider,
        externalId: m.id,
        previewUrl: m.previewUrl,
        mediaUrl: m.url,
      });
    } else if (item.kind === 'trending') {
      const meme = item.meme;
      await toggleSavedExpressiveMedia({
        kind: meme.kind === 'gif' ? 'gif' : 'meme',
        provider: meme.gifProvider ?? 'clash',
        externalId: meme.gifExternalId ?? meme.messageId,
        previewUrl: meme.previewUrl,
        mediaUrl: meme.mediaUrl,
        sourceMessageId: meme.messageId,
      });
    }
  } catch {
    /* best-effort */
  }
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  title: { ...typeScale.title, fontSize: 20, fontWeight: '800' },
  mainTabs: { flexDirection: 'row', paddingHorizontal: space.md, gap: space.md },
  mainTab: { paddingVertical: 8, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  mainTabText: { ...typeScale.caption, fontSize: 12, fontWeight: '800', letterSpacing: 0.6 },
  subTabs: {
    flexDirection: 'row',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: 6,
  },
  subChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill },
  subChipText: { ...typeScale.caption, fontSize: 12, fontWeight: '700' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: space.md,
    marginBottom: space.sm,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: { flex: 1, ...typeScale.body, fontSize: 15, paddingVertical: 0 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  tile: { borderRadius: radius.md, overflow: 'hidden' },
  uploadTile: {
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadText: { ...typeScale.caption, fontWeight: '700' },
  thumb: { width: '100%', height: '100%' },
  attribution: { ...typeScale.caption, fontSize: 10, textAlign: 'center', paddingBottom: 8 },
});
