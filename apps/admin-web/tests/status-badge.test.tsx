import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusBadge } from "@/components/status-badge";

describe("StatusBadge", () => {
  it("renders the canonical active, disabled, and missing states", () => {
    const { rerender } = render(<StatusBadge status="active" />);
    expect(screen.getByText("启用")).toBeInTheDocument();

    rerender(<StatusBadge status="disabled" />);
    expect(screen.getByText("停用")).toBeInTheDocument();

    rerender(<StatusBadge status={null} />);
    expect(screen.getByText("未生成")).toBeInTheDocument();
  });
});
