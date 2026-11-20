/** Arena ⇄ Vault route pairs for the Realm Switch (spec §16, §23). */
export const REALM_ROUTES = {
  arenaHome: '/(tabs)',
  arenaProfile: '/(tabs)/profile',
  vaultHome: '/(vault)',
  vaultProfile: '/(vault)/profile',
} as const;
