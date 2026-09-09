import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AlertsCard } from "./alerts-card";

const ALERTS = [
  { id: "a", name: "HighErrorRate · gateway", severity: "firing" as const },
  { id: "b", name: "QueueBacklog · mesh-worker", severity: "pending" as const },
];

describe("AlertsCard", () => {
  it("lists every active alert with its severity", () => {
    render(<AlertsCard alerts={ALERTS} />);
    expect(screen.getByText("HighErrorRate · gateway")).toBeInTheDocument();
    expect(screen.getByText("firing")).toBeInTheDocument();
    expect(screen.getByText("QueueBacklog · mesh-worker")).toBeInTheDocument();
    expect(screen.getByText("pending")).toBeInTheDocument();
  });

  it("says all is well rather than showing a blank panel", () => {
    render(<AlertsCard alerts={[]} />);
    expect(screen.getByText("All clear. No active alerts.")).toBeInTheDocument();
  });

  it("keeps its heading in both states", () => {
    const { rerender } = render(<AlertsCard alerts={ALERTS} />);
    expect(screen.getByText("Alerts")).toBeInTheDocument();

    rerender(<AlertsCard alerts={[]} />);
    expect(screen.getByText("Alerts")).toBeInTheDocument();
  });
});
