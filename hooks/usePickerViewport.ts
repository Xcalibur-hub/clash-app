import React from 'react';
import { Keyboard, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  exploreKeyboardOverlap,
  explorePickerBackdropLift,
  explorePickerBottomInset,
  explorePickerSheetHeight,
} from '../utils/explorePickerLayout';

export interface PickerViewport {
  sheetHeight: number;
  lift: number;
  bottomPad: number;
  onSurfaceLayout: (event: LayoutChangeEvent) => void;
}

/**
 * Viewport for the country picker sheet (Explore E2.8).
 *
 * The sheet lives in a full-screen `Modal`. On Android edge-to-edge that surface
 * spans the system bars while `Dimensions.window` does not, and the keyboard is
 * reported against the window — so the surface is measured instead of assumed,
 * and the two spaces are reconciled in `utils/explorePickerLayout.ts`.
 */
export function usePickerViewport(active: boolean): PickerViewport {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [keyboardHeight, setKeyboardHeight] = React.useState(0);
  const [surfaceHeight, setSurfaceHeight] = React.useState(0);

  // Tallest window seen: a platform that resizes for the IME already accounts
  // for the keyboard, so it must not be subtracted twice.
  const baselineRef = React.useRef(windowHeight);
  if (windowHeight > baselineRef.current) baselineRef.current = windowHeight;

  React.useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', (event) =>
      setKeyboardHeight(event.endCoordinates.height),
    );
    const hidden = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  React.useEffect(() => {
    if (!active) setKeyboardHeight(0);
  }, [active]);

  const surface = surfaceHeight > 0 ? surfaceHeight : windowHeight;
  const viewport = {
    surfaceHeight: surface,
    topInset: insets.top,
    bottomInset: insets.bottom,
    keyboardOverlap: exploreKeyboardOverlap({
      keyboardHeight,
      windowHeight,
      surfaceHeight: surface,
      topInset: insets.top,
      baselineHeight: baselineRef.current,
    }),
  };

  return {
    sheetHeight: explorePickerSheetHeight(viewport),
    lift: explorePickerBackdropLift(viewport),
    bottomPad: explorePickerBottomInset(insets.bottom),
    onSurfaceLayout: (event) => setSurfaceHeight(event.nativeEvent.layout.height),
  };
}
