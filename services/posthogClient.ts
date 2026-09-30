/**
 * PostHog core client only.
 *
 * Do not import from `posthog-react-native` (package index). That barrel pulls
 * `./hooks/useNavigationTracker` and Metro fails to resolve it. Import the
 * compiled client module directly instead.
 */
export { PostHog } from 'posthog-react-native/dist/posthog-rn';
