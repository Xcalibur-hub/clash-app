import React from 'react';
import {usePathname} from 'expo-router';
import {useAuth} from '../../store/AuthProvider';
import {exploreAccountKey} from '../../utils/exploreAccountScope';

export interface ExploreAccountOptions {
  /**
   * Keep screen state when only the route path changes.
   *
   * World opts in so a country page push — or a tab switch — returns to the same
   * World context. Identity is still part of the key, so signing out or switching
   * accounts always resets local discovery state.
   */
  retainAcrossPaths?: boolean;
}

/**
 * Scopes an Explore screen's local state to the signed-in identity.
 *
 * Rendering through a `key` is what resets state on identity change; the key never
 * includes stale data, so React Navigation's mounted-screen lifecycle is preserved
 * for screens that opt out of per-path scoping.
 */
export function withExploreAccount(
 Screen:()=>React.JSX.Element,
 {retainAcrossPaths=false}:ExploreAccountOptions={},
):()=>React.JSX.Element {
 return function ExploreAccountBoundary(){
  const {user}=useAuth();
  const path=usePathname();
  return (
   <Screen key={exploreAccountKey({userId:user?.id,path,retainAcrossPaths})}/>
  );
 };
}

