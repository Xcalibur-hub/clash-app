/**
 * PostHog core client only.
 *
 * Do not import from `posthog-react-native` (package index). That barrel pulls
 * `./hooks/useNavigationTracker` and Metro fails to resolve it. Import the
 * compiled client module by filesystem path instead.
 */
// Relative path keeps TypeScript + Metro off the package "exports" map.
export { PostHog } from '../node_modules/posthog-react-native/dist/posthog-rn.js';
