import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";

import { QrCodeCard } from "@/components/qr-code-card";
import { api } from "@/lib/api";
import type { QrCodeResponse } from "@/lib/types";

vi.mock("@/auth/auth-context", () => ({ useAuth: () => ({ admin: { role: "admin" } }) }));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const qrCode: QrCodeResponse = {
  id: "qr-1",
  storeId: "store-1",
  sceneToken: "a".repeat(32),
  status: "active",
  generatedAt: "2026-10-11T00:00:00.000Z",
  disabledAt: null,
  previewUrl: "/api/admin/qrcodes/qr-1/download",
  downloadUrl: "/api/admin/qrcodes/qr-1/download",
  provider: "local-placeholder",
};

afterEach(() => vi.restoreAllMocks());

describe("QR actions embedded in a store form", () => {
  it("generates the QR without submitting unsaved store edits", async () => {
    vi.spyOn(api, "generateQrCode").mockResolvedValue(qrCode);
    const submit = vi.fn((event: React.FormEvent) => event.preventDefault());
    const onChange = vi.fn();
    render(
      <form onSubmit={submit}>
        <QrCodeCard storeId="store-1" storeName="测试店" qrCode={null} onChange={onChange} />
      </form>,
    );

    fireEvent.click(screen.getByRole("button", { name: "生成二维码" }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(qrCode));
    expect(submit).not.toHaveBeenCalled();
  });

  it("reports denied clipboard access without submitting the form", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("Permission denied")) },
    });
    const submit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <form onSubmit={submit}>
        <QrCodeCard storeId="store-1" storeName="测试店" qrCode={qrCode} onChange={vi.fn()} />
      </form>,
    );

    fireEvent.click(screen.getByRole("button", { name: "复制场景 Token" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("复制失败，请检查浏览器剪贴板权限"),
    );
    expect(submit).not.toHaveBeenCalled();
  });
});
