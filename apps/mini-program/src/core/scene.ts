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

/** Explicit page parameters win, including malformed values. Never fall back to a stale code. */
export function sceneFromEntry(
  page: Readonly<Record<string, unknown>>,
  enter?: { readonly query?: Readonly<Record<string, unknown>>; readonly path?: string },
  launch?: { readonly query?: Readonly<Record<string, unknown>>; readonly path?: string },
): unknown {
  const connectQuery = (entry: typeof enter) =>
    !entry?.path || entry.path.replace(/^\//, "") === "pages/connect/index"
      ? entry?.query
      : undefined;
  for (const query of [page, connectQuery(enter), connectQuery(launch)]) {
    if (!query) continue;
    for (const key of ["scene", "shortId", "id"]) {
      if (Object.prototype.hasOwnProperty.call(query, key)) return query[key];
    }
  }
  return undefined;
}
