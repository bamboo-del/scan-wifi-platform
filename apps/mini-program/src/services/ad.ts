export type AdPlacement = "banner" | "rewardedVideo" | "interstitial";

/** Ads never gate credential access or connection. Unimplemented placements stay off. */
export class AdService {
  constructor(private readonly enabled = false) {}
  canDisplay(placement: AdPlacement, backendEnabled: boolean, unitId: string): boolean {
    return this.enabled && placement === "banner" && backendEnabled && unitId.trim().length > 0;
  }
}
