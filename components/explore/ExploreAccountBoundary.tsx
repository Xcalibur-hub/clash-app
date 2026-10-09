import React from 'react';
import {usePathname} from 'expo-router';
import {useAuth} from '../../store/AuthProvider';

/** Local discovery state must never survive an identity change. */
export function withExploreAccount(Screen:()=>React.JSX.Element):()=>React.JSX.Element {
 return function ExploreAccountBoundary(){
  const {user}=useAuth();
  const path=usePathname();
  return <Screen key={(user?.id??'guest')+':'+path}/>;
 };
}
