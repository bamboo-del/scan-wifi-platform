export function shouldDisplayAd(input: {
  globalEnabled: boolean;
  storeEnabled: boolean;
  adUnitId: string;
}): boolean {
  return input.globalEnabled && input.storeEnabled && input.adUnitId.trim().length > 0;
}
