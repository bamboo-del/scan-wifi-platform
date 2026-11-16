import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api";
import type { StoreSummary } from "@/lib/types";
import { loadQrRows } from "@/pages/qr-codes-page";

afterEach(() => vi.restoreAllMocks());

describe("QR store listing", () => {
  it("continues beyond the first 100 stores", async () => {
    const first = { id: "store-1", qrCode: null } as StoreSummary;
    const last = { id: "store-101", qrCode: null } as StoreSummary;
    const list = vi
      .spyOn(api, "listStores")
      .mockResolvedValueOnce({ items: [first], page: 1, pageSize: 100, total: 101, totalPages: 2 })
      .mockResolvedValueOnce({ items: [last], page: 2, pageSize: 100, total: 101, totalPages: 2 });
    const getQr = vi.spyOn(api, "getQrCode").mockResolvedValue(null);

    const rows = await loadQrRows("");

    expect(rows.map((row) => row.store.id)).toEqual(["store-1", "store-101"]);
    expect(getQr).not.toHaveBeenCalled();
    expect(list).toHaveBeenLastCalledWith({ page: 2, pageSize: 100, search: "", status: "all" });
  });
});
