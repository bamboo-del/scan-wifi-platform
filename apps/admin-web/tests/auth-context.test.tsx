import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider, useAuth } from "@/auth/auth-context";
import { api, SESSION_EXPIRED_EVENT } from "@/lib/api";

function SessionStatus(): React.JSX.Element {
  const { admin, status } = useAuth();
  return (
    <div>
      {status}:{admin?.username ?? "none"}
    </div>
  );
}

afterEach(() => vi.restoreAllMocks());

describe("administrator session state", () => {
  it("removes the cached administrator identity after a protected API rejects the session", async () => {
    vi.spyOn(api, "session").mockResolvedValue({
      authenticated: true,
      admin: { id: "admin-1", username: "admin", role: "admin" },
      expiresAt: "2026-10-12T00:00:00.000Z",
    });
    render(
      <AuthProvider>
        <SessionStatus />
      </AuthProvider>,
    );
    await screen.findByText("authenticated:admin");

    await act(() => window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT)));

    expect(screen.getByText("anonymous:none")).toBeInTheDocument();
  });
});
