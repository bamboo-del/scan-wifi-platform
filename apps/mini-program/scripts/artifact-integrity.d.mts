export type MiniProgramArtifactMode = "development" | "trial" | "production";

export interface MiniProgramArtifactSummary {
  readonly mode: MiniProgramArtifactMode;
  readonly pages: readonly string[];
  readonly artifactRoot: string;
  readonly diagnosticsIncluded: boolean;
  readonly relativeDependenciesChecked: number;
  readonly localComponentsChecked: number;
}

export function verifyMiniProgramArtifact(options: {
  readonly packageRoot: string;
  readonly mode: MiniProgramArtifactMode;
}): Promise<MiniProgramArtifactSummary>;
