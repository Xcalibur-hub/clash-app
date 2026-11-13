/**
 * Minimal typings for the one react-dom/server function the AURA render check
 * uses. `@types/react-dom` is not a dependency at the base commit and this is a
 * local review tool, so we type the single surface instead of adding a package.
 */
declare module 'react-dom/server' {
  import type { ReactElement } from 'react';
  export function renderToStaticMarkup(element: ReactElement): string;
}
