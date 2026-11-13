/**
 * Icon shim for the AURA render check.
 *
 * `components/shared/icons.ts` imports Lucide via per-icon subpaths
 * (`lucide-react-native/icons/swords`) so Metro only bundles the glyphs we draw.
 * Those subpaths do not resolve under Node/esbuild, and drawing an SVG is outside
 * what a static markup probe can verify anyway.
 *
 * The shim preserves the thing that *is* verifiable: the icon is a component that
 * receives `size`, `color` and `strokeWidth` and renders a marked empty span, so
 * a probe can see that an icon was mounted in the right place. Glyph shape,
 * weight and colour are NOT verified here.
 *
 * Written as ESM with a `default` export because `icons.ts` uses default imports
 * (`import X from '…/icons/swords'`); a CommonJS `module.exports` object is not
 * statically readable by esbuild, which is why the first attempt produced
 * `undefined` components.
 */
import React from 'react';

const cache = new Map();

function icon(name) {
  const Icon = React.forwardRef(function Icon(props, ref) {
    return React.createElement('span', {
      ref,
      'data-icon': name,
      'data-size': String(props.size ?? ''),
      'data-stroke': String(props.strokeWidth ?? ''),
      'aria-hidden': 'true',
    });
  });
  Icon.displayName = `Icon(${name})`;
  return Icon;
}

/**
 * Every subpath aliased to this file resolves to the *same* module, so the name
 * cannot come from the import path. A neutral marker is used instead: the probe
 * asserts that an icon mounted, not which glyph it drew.
 */
const Fallback = icon('icon');

export default Fallback;
export const sizeOf = (props) => props.size;
export { cache };
