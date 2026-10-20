/** Next-Clash notice visibility: a failure must stay visible without its CTA. */
export function nextClashActionVisible(input: {
  hasVerdict: boolean;
  hasSuggestion: boolean;
  notice: string | null;
}): boolean {
  if (!input.hasVerdict) return false;
  return input.hasSuggestion || Boolean(input.notice);
}
