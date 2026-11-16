import { afterEach, describe, expect, it, vi } from "vitest";

import { api, ApiError } from "@/lib/api";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("admin API client", () => {
  it("sends administrator login with cookie credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          authenticated: true,
          admin: { id: "admin-1", username: "admin" },
          expiresAt: "2026-07-13T00:00:00.000Z",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.login("admin", "Admin123!")).resolves.toMatchObject({
      authenticated: true,
      admin: { username: "admin" },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/auth/login",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ username: "admin", password: "Admin123!" }),
      }),
    );
  });

  it("normalizes the shared API error envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: "INVALID_CREDENTIALS",
              message: "用户名或密码不正确",
              requestId: "request-123",
            },
          }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const error = await api.login("admin", "wrong-password").catch((value: unknown) => value);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 401,
      code: "INVALID_CREDENTIALS",
      requestId: "request-123",
      message: "用户名或密码不正确",
    });
  });

  it("returns a user-safe network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("socket closed")));

    await expect(api.session()).rejects.toMatchObject({
      status: 0,
      code: "NETWORK_ERROR",
      message: "无法连接服务，请检查网络后重试",
    });
  });

  it("maps canonical store statuses to the matching action endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await api.setStoreStatus("store-1", "disabled");
    await api.setStoreStatus("store-1", "active");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/admin/stores/store-1/disable",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/admin/stores/store-1/enable",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
  });

  it("sends the canonical Wi-Fi security type value", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await api.updateWifi("store-1", {
      ssid: "Cafe-WiFi",
      password: "SecureWiFi2026!",
      securityType: "WPA2_WPA3",
      status: "active",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/stores/store-1/wifi",
      expect.objectContaining({
        method: "PUT",
        credentials: "include",
        body: JSON.stringify({
          ssid: "Cafe-WiFi",
          password: "SecureWiFi2026!",
          securityType: "WPA2_WPA3",
          status: "active",
        }),
      }),
    );
  });

  it("maps canonical QR code statuses to the matching action endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await api.setQrCodeStatus("qr-1", "disabled");
    await api.setQrCodeStatus("qr-1", "active");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/admin/qrcodes/qr-1/disable",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/admin/qrcodes/qr-1/enable",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
  });

  it("treats a store without a QR code as an empty state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: "QR_CODE_NOT_FOUND",
              message: "该门店尚未生成小程序码",
              requestId: "request-qr-missing",
            },
          }),
          { status: 404, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    await expect(api.getQrCode("store-without-qr")).resolves.toBeNull();
  });

  it("does not hide unrelated QR code lookup failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: "STORE_NOT_FOUND",
              message: "门店不存在",
              requestId: "request-store-missing",
            },
          }),
          { status: 404, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    await expect(api.getQrCode("missing-store")).rejects.toMatchObject({
      status: 404,
      code: "STORE_NOT_FOUND",
    });
  });
});
