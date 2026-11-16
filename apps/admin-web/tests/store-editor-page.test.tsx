import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api";
import type { StoreDetail } from "@/lib/types";
import StoreEditorPage from "@/pages/store-editor-page";

const identity = vi.hoisted(() => ({ role: "admin", id: "operator-1" }));
vi.mock("@/auth/auth-context", () => ({ useAuth: () => ({ admin: identity }) }));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const store: StoreDetail = {
  id: "store-1",
  createdById: null,
  ownerId: null,
  name: "测试店",
  shortName: null,
  logoUrl: null,
  address: null,
  contactName: null,
  contactPhone: null,
  adEnabled: false,
  status: "active",
  hasWifi: false,
  qrCodeStatus: null,
  qrCode: null,
  createdAt: "2026-10-11T00:00:00.000Z",
  updatedAt: "2026-10-11T00:00:00.000Z",
  wifi: {
    configured: false,
    ssid: null,
    passwordMasked: null,
    bssid: null,
    securityType: null,
    status: null,
    version: null,
    updatedAt: null,
  },
};

afterEach(() => {
  identity.role = "admin";
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("store editor persistence", () => {
  it("lets an operator retry initial Wi-Fi without editing the user profile", async () => {
    identity.role = "operator";
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.spyOn(api, "getStore").mockResolvedValue({
      ...store,
      createdById: identity.id,
      ownerId: identity.id,
    });
    const updateStore = vi.spyOn(api, "updateStore");
    const updateWifi = vi
      .spyOn(api, "updateWifi")
      .mockResolvedValue({ ...store.wifi, configured: true });
    render(
      <MemoryRouter initialEntries={["/stores/store-1/edit"]}>
        <Routes>
          <Route path="/stores/:id/edit" element={<StoreEditorPage />} />
          <Route path="/stores/:id" element={<p>用户详情</p>} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByLabelText(/Wi-Fi 名称/);
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Wi-Fi 名称/), { target: { value: "Initial" } });
    fireEvent.change(screen.getByLabelText(/新 Wi-Fi 密码/), { target: { value: "NewPassword1" } });
    fireEvent.change(screen.getByLabelText(/确认新密码/), { target: { value: "NewPassword1" } });
    fireEvent.click(screen.getByRole("button", { name: "保存更改" }));
    await screen.findByText("用户详情");
    expect(updateWifi).toHaveBeenCalledOnce();
    expect(updateStore).not.toHaveBeenCalled();
  });

  it("opens missing Wi-Fi credentials and reports partial persistence without losing the draft", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.spyOn(api, "getStore").mockResolvedValue(store);
    vi.spyOn(api, "settings").mockResolvedValue({
      globalAdEnabled: false,
      adUnitConfigured: false,
      wechatQrConfigured: false,
      qrCodeProvider: "local-placeholder",
      legacyWifiApiEnabled: false,
    });
    let finishStoreSave!: (value: StoreDetail) => void;
    const saveStore = vi.spyOn(api, "updateStore").mockImplementation(
      () =>
        new Promise((resolve) => {
          finishStoreSave = resolve;
        }),
    );
    const saveWifi = vi.spyOn(api, "updateWifi").mockRejectedValue(new Error("网络暂不可用"));
    render(
      <MemoryRouter initialEntries={["/stores/store-1/edit"]}>
        <Routes>
          <Route path="/stores/:id/edit" element={<StoreEditorPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { name: "测试店" });
    expect(screen.queryByLabelText("备注")).not.toBeInTheDocument();
    for (const label of [/用户名称/, /简称/, /^地址/, /联系人/, /联系电话/, /Logo 地址/]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    await userEvent.click(screen.getByRole("tab", { name: "Wi-Fi 配置" }));
    fireEvent.change(screen.getByLabelText(/Wi-Fi 名称/), { target: { value: " Cafe " } });
    fireEvent.change(screen.getByLabelText(/新 Wi-Fi 密码/), { target: { value: "NewPassword1" } });
    fireEvent.change(screen.getByLabelText(/确认新密码/), { target: { value: "NewPassword1" } });
    fireEvent.click(screen.getByRole("button", { name: "保存更改" }));

    await waitFor(() => expect(saveStore).toHaveBeenCalledOnce());
    expect(saveStore.mock.calls[0]?.[1]).not.toHaveProperty("notes");
    expect(saveWifi).not.toHaveBeenCalled();
    finishStoreSave(store);

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("用户资料已保存，但 Wi-Fi 配置失败：网络暂不可用"),
    );
    expect(saveWifi).toHaveBeenCalledWith("store-1", expect.objectContaining({ ssid: " Cafe " }));
    expect(screen.getByLabelText(/新 Wi-Fi 密码/)).toHaveValue("NewPassword1");
    expect(toast.success).not.toHaveBeenCalled();
  });
});
