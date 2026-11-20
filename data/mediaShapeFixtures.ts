/**
 * Dev-only media aspect-ratio fixtures for TakeMedia / ClashSideCard review.
 * Not wired into production feeds — import in Storybook/dev previews only.
 */
import type { TakeMedia } from '../store';

const plate = (caption: string, colors: [string, string]): TakeMedia => ({
  kind: 'image',
  caption,
  colors,
  url: undefined,
});

/** Gradient plates approximating common shapes when URL assets are unavailable. */
export const MEDIA_SHAPE_FIXTURES: Readonly<Record<string, TakeMedia>> = {
  portrait: {
    kind: 'image',
    caption: 'Portrait photo',
    colors: ['#1C1917', '#44403C'],
    // 3:4 — use with local preview assets when available
    url: 'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=900&h=1200&fit=crop',
  },
  landscape: {
    kind: 'image',
    caption: 'Landscape photo',
    colors: ['#0C4A6E', '#082F49'],
    url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1600&h=900&fit=crop',
  },
  square: {
    kind: 'image',
    caption: 'Square',
    colors: ['#292524', '#57534E'],
    url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1000&h=1000&fit=crop',
  },
  screenshot: {
    kind: 'image',
    caption: 'Wide screenshot / document',
    colors: ['#111827', '#374151'],
    url: 'https://images.unsplash.com/photo-1555949963-aa79dcee981c?w=1800&h=900&fit=crop',
  },
  textOnlyPlate: plate('Text-only take (no url)', ['#1C1917', '#3F3F46']),
};
