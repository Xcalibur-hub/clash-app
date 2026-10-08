import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChallengeInbox } from '../../components/arena/ChallengeInbox';
import { BackIcon } from '../../components/shared/icons';
import { layout, space, useThemeColors } from '../../theme';

export default function ChallengeInboxScreen(): React.JSX.Element {
  const t=useThemeColors(),insets=useSafeAreaInsets(),router=useRouter();
  return <View style={{flex:1,backgroundColor:t.background,paddingTop:insets.top,paddingBottom:insets.bottom}}>
    <Pressable accessibilityRole="button" accessibilityLabel="Back to Arena" onPress={()=>router.canGoBack()?router.back():router.replace('/')}
      style={{minHeight:44,paddingHorizontal:layout.screenX,flexDirection:'row',alignItems:'center',gap:space.sm}}>
      <BackIcon size={20} color={t.textPrimary}/><Text style={{color:t.textPrimary}}>Back</Text>
    </Pressable>
    <ChallengeInbox />
  </View>;
}
