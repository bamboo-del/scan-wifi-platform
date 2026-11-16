import { describe, expect, it } from "vitest";
import { parseSceneToken } from "../src/core/scene";

const VALID_SCENE = "0123456789abcdef0123456789abcdef";

describe("parseSceneToken", () => {
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
