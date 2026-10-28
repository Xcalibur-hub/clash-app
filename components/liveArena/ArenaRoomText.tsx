import React from 'react';
import { Text, useWindowDimensions, type TextProps } from 'react-native';

/** Re-measure native text after an Android font-scale change, without remounting
 * the surrounding action, draft or async operation. Font scaling stays enabled. */
export const ArenaRoomText = React.forwardRef<React.ElementRef<typeof Text>, TextProps>(
  function ArenaRoomText(props, ref) {
    const { fontScale } = useWindowDimensions();
    return <Text key={fontScale} {...props} ref={ref} />;
  },
);
