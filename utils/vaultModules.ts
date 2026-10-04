/**
 * Creator World module registry (Phase 15.0).
 *
 * Future phases register renderers against these types without rewriting
 * Creator World. Unsupported / empty modules never appear to consumers.
 */

export type CreatorModuleType =
  | 'CONTENT'
  | 'COLLECTIONS'
  | 'SERVICES'
  | 'COURSES'
  | 'STORE'
  | 'COMMUNITY'
  | 'EXPERIENCES'
  | 'AI'
  | 'LIVE'
  | 'WORLD_DROPS';

export type ModuleAvailability = 'supported' | 'planned';

export interface CreatorModuleDefinition {
  type: CreatorModuleType;
  title: string;
  /** Consumer-facing section label when the module is shown. */
  sectionTitle: string;
  availability: ModuleAvailability;
  /** Lower renders earlier. */
  priority: number;
}

export interface CreatorWorldModule extends CreatorModuleDefinition {
  /** True when this creator currently has real data for the module. */
  hasData: boolean;
}

/** Canonical registry — planned modules exist for architecture only. */
export const CREATOR_MODULE_REGISTRY: readonly CreatorModuleDefinition[] = [
  {
    type: 'CONTENT',
    title: 'Latest',
    sectionTitle: 'NEW FROM THIS WORLD',
    availability: 'supported',
    priority: 10,
  },
  {
    type: 'COLLECTIONS',
    title: 'Collections',
    sectionTitle: 'COLLECTIONS',
    availability: 'supported',
    priority: 20,
  },
  {
    type: 'EXPERIENCES',
    title: 'Experiences',
    sectionTitle: 'EXPERIENCES',
    availability: 'planned',
    priority: 30,
  },
  {
    type: 'SERVICES',
    title: 'Services',
    sectionTitle: 'SERVICES',
    availability: 'planned',
    priority: 40,
  },
  {
    type: 'COURSES',
    title: 'Courses',
    sectionTitle: 'LEARN',
    availability: 'planned',
    priority: 50,
  },
  {
    type: 'STORE',
    title: 'Shop',
    sectionTitle: 'SHOP',
    availability: 'planned',
    priority: 60,
  },
  {
    type: 'COMMUNITY',
    title: 'Community',
    sectionTitle: 'COMMUNITY',
    availability: 'planned',
    priority: 70,
  },
  {
    type: 'AI',
    title: 'Creator AI',
    sectionTitle: 'CREATOR AI',
    availability: 'planned',
    priority: 80,
  },
  {
    type: 'LIVE',
    title: 'Live',
    sectionTitle: 'LIVE',
    availability: 'planned',
    priority: 90,
  },
  {
    type: 'WORLD_DROPS',
    title: 'World Drops',
    sectionTitle: 'WORLD DROPS',
    availability: 'planned',
    priority: 100,
  },
] as const;

export interface CreatorWorldModuleSignals {
  /** Live + archived storefront drops the viewer may list. */
  contentCount: number;
  collectionCount: number;
  /** Reserved for future phases — keep at 0 in 15.0. */
  experienceCount?: number;
  serviceCount?: number;
  courseCount?: number;
  storeCount?: number;
  communityReady?: boolean;
  aiReady?: boolean;
  liveReady?: boolean;
  worldDropCount?: number;
}

function signalFor(type: CreatorModuleType, signals: CreatorWorldModuleSignals): boolean {
  switch (type) {
    case 'CONTENT':
      return signals.contentCount > 0;
    case 'COLLECTIONS':
      return signals.collectionCount > 0;
    case 'EXPERIENCES':
      return (signals.experienceCount ?? 0) > 0;
    case 'SERVICES':
      return (signals.serviceCount ?? 0) > 0;
    case 'COURSES':
      return (signals.courseCount ?? 0) > 0;
    case 'STORE':
      return (signals.storeCount ?? 0) > 0;
    case 'COMMUNITY':
      return signals.communityReady === true;
    case 'AI':
      return signals.aiReady === true;
    case 'LIVE':
      return signals.liveReady === true;
    case 'WORLD_DROPS':
      return (signals.worldDropCount ?? 0) > 0;
    default:
      return false;
  }
}

/**
 * Modules the consumer Creator World may render.
 * Planned modules never appear, even if a future signal is accidentally set,
 * until their availability flips to `supported` in a later phase.
 */
export function resolveCreatorWorldModules(
  signals: CreatorWorldModuleSignals,
): CreatorWorldModule[] {
  return CREATOR_MODULE_REGISTRY.map((def) => ({
    ...def,
    hasData: signalFor(def.type, signals),
  }))
    .filter((mod) => mod.availability === 'supported' && mod.hasData)
    .sort((a, b) => a.priority - b.priority);
}

/** True when a module type is safe to render for consumers in this phase. */
export function isCreatorModuleSupported(type: CreatorModuleType): boolean {
  return CREATOR_MODULE_REGISTRY.some(
    (mod) => mod.type === type && mod.availability === 'supported',
  );
}
