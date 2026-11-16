import { describe, expect, it, vi } from "vitest";
import { AnalyticsService, dailyVisitorId } from "../src/services/analytics";
import type { PublicApi, PublicEventInput } from "../src/core/types";

describe("optional daily analytics", () => {
  it("reuses a daily ID, rotates on the next UTC date, and stores no network credentials", () => {
    let stored: unknown;
    const storage = {
      getStorageSync: () => stored,
      setStorageSync: (_key: string, value: unknown) => {
        stored = value;
      },
    };
    const first = dailyVisitorId(storage, new Date("2026-09-13T23:00:00Z"));
    expect(first).toMatch(/^[a-f0-9]{32}$/);
    expect(dailyVisitorId(storage, new Date("2026-09-13T23:59:59Z"))).toBe(first);
    expect(dailyVisitorId(storage, new Date("2026-09-14T00:00:00Z"))).not.toBe(first);
    expect(Object.keys(stored as object).sort()).toEqual(["day", "id"]);
  });

  it("does not touch storage or send events when disabled and contains telemetry failures", () => {
    const visitor = vi.fn(() => "a".repeat(32));
    const reportEvent = vi.fn(() => Promise.reject(new Error("offline")));
    const api = { reportEvent } as unknown as PublicApi;
    const event: PublicEventInput = {
      sceneToken: "b".repeat(32),
      eventType: "page_view",
      platform: "ios",
    };
    new AnalyticsService(api, false, visitor).report(event);
    expect(visitor).not.toHaveBeenCalled();
    expect(reportEvent).not.toHaveBeenCalled();
    expect(() => new AnalyticsService(api, true, visitor).report(event)).not.toThrow();
    expect(reportEvent).toHaveBeenCalledOnce();
    expect(() =>
      new AnalyticsService(api, true, () => {
        throw new Error("storage denied");
      }).report(event),
    ).not.toThrow();
  });
});
