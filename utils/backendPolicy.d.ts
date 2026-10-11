export type AppVariant = 'development' | 'preview' | 'staging' | 'production';
export type BackendOrigins = { staging: readonly string[]; production: readonly string[] };
export function resolveAppVariant(value: unknown): AppVariant;
export function assertBackendAllowed(variant: AppVariant, url: string, origins: BackendOrigins): void;
export function backendStorageKey(url: string): string;
export function assertNativeVariant(variant: AppVariant, applicationId: string | null): void;
