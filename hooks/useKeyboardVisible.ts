import React from 'react';
import { Keyboard } from 'react-native';

/**
 * True while the soft keyboard is on screen.
 *
 * Android here runs edge-to-edge, so `adjustResize` does not shrink the window
 * and the keyboard must be avoided explicitly. Knowing whether the IME is up
 * lets a screen drop the home-indicator inset while it is, instead of stacking
 * both and leaving a blank gap above the keyboard.
 */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', () => setVisible(true));
    const hidden = Keyboard.addListener('keyboardDidHide', () => setVisible(false));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);
  return visible;
}
