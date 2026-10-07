/**
 * Crowd presentation gate — production must never treat layout mocks as live data.
 */
export function crowdLayerUsesProductionMocks(showDevLayout: boolean): boolean {
  return showDevLayout === true;
}

export function crowdDevLayoutEnabled(
  flag: boolean | undefined = typeof __DEV__ !== 'undefined' ? __DEV__ : false,
): boolean {
  return Boolean(flag);
}
