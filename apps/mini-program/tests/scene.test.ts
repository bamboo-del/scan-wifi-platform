import { describe, expect, it } from "vitest";
import { parseSceneToken, sceneFromEntry } from "../src/core/scene";

const VALID_SCENE = "0123456789abcdef0123456789abcdef";

describe("parseSceneToken", () => {
  it("unifies explicit aliases and cold/warm query entries without accepting launch scene numbers", () => {
    for (const key of ["scene", "shortId", "id"])
      expect(parseSceneToken(sceneFromEntry({ [key]: VALID_SCENE }))).toBe(VALID_SCENE);
    expect(parseSceneToken(sceneFromEntry({}, { query: { scene: VALID_SCENE } }))).toBe(
      VALID_SCENE,
    );
    expect(parseSceneToken(sceneFromEntry({}, undefined, { query: { id: VALID_SCENE } }))).toBe(
      VALID_SCENE,
    );
    expect(
      parseSceneToken(sceneFromEntry({ scene: "%broken" }, { query: { scene: VALID_SCENE } })),
    ).toBeNull();
    expect(parseSceneToken(sceneFromEntry({ scene: 1047 }))).toBeNull();
    expect(parseSceneToken(VALID_SCENE.replace("0", "%30"))).toBe(VALID_SCENE);
    expect(
      sceneFromEntry({}, { path: "pages/manage/detail", query: { id: "merchant-spot" } }),
    ).toBeUndefined();
  });
  it("accepts exactly 32 lowercase hexadecimal characters", () => {
    expect(parseSceneToken(VALID_SCENE)).toBe(VALID_SCENE);
  });

  it.each([
    undefined,
    null,
    "",
    "0123456789abcdef",
    "0123456789ABCDEF0123456789ABCDEF",
    "g123456789abcdef0123456789abcdef",
    `${VALID_SCENE}0`,
    "%E0%A4%A",
  ])("rejects an invalid scene value: %s", (value) => {
    expect(parseSceneToken(value)).toBeNull();
  });
});
