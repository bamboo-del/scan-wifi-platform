const SCENE_TOKEN_PATTERN = /^[0-9a-f]{32}$/;

export function parseSceneToken(rawScene: unknown): string | null {
  if (typeof rawScene !== "string") {
    return null;
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(rawScene);
  } catch {
    return null;
  }

  return SCENE_TOKEN_PATTERN.test(decoded) ? decoded : null;
}
