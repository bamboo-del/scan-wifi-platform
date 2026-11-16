import type { PublicApi, PublicEventInput } from "../core/types";

interface VisitorStorage {
  getStorageSync?(key: string): unknown;
  setStorageSync?(key: string, value: unknown): void;
}

/** Anonymous per-installation, per-UTC-day counter ID; never used for authorization. */
export function dailyVisitorId(storage: VisitorStorage, now = new Date()): string {
  const day = now.toISOString().slice(0, 10);
  try {
    const value = storage.getStorageSync!("wifi-visit-day");
    if (
      typeof value === "object" &&
      value !== null &&
      "day" in value &&
      value.day === day &&
      "id" in value &&
      typeof value.id === "string" &&
      /^[a-f0-9]{32}$/.test(value.id)
    )
      return value.id;
  } catch {
    /* Storage denial does not block connection. */
  }
  const id = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  try {
    storage.setStorageSync!("wifi-visit-day", { day, id });
  } catch {
    /* Best effort. */
  }
  return id;
}

export class AnalyticsService {
  constructor(
    private readonly api: PublicApi,
    private readonly enabled: boolean,
    private readonly visitor: () => string | undefined,
  ) {}
  report(event: PublicEventInput): void {
    if (!this.enabled) return;
    try {
      const visitorId = this.visitor();
      void this.api
        .reportEvent({ ...event, ...(visitorId ? { visitorId } : {}) })
        .catch(() => undefined);
    } catch {
      /* Telemetry must not interrupt the Wi-Fi flow. */
    }
  }
}
