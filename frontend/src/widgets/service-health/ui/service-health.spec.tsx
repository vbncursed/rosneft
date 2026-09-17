import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ServiceHealthList } from "./service-health";
import type { ServiceHealth } from "@/entities/metric";

const service = (name: string, over: Partial<ServiceHealth> = {}): ServiceHealth => ({
  name,
  state: "up",
  meta: "142 rps",
  samples: [1, 2, 3],
  latency: "18ms",
  errors: "0.1/s",
  ...over,
});

const SERVICES = [service("gateway"), service("audit-service", { state: "down", latency: "—", errors: "—" })];

describe("ServiceHealthList", () => {
  it("is a labelled section counting the services and what is down", () => {
    render(<ServiceHealthList services={SERVICES} />);
    expect(screen.getByRole("region", { name: "Service health" })).toBeInTheDocument();
    expect(screen.getByText("2 services · 1 down")).toBeInTheDocument();
  });

  it("renders one row per service", () => {
    render(<ServiceHealthList services={SERVICES} />);
    expect(screen.getAllByRole("article")).toHaveLength(2);
  });

  it("marks the selected service", () => {
    render(<ServiceHealthList services={SERVICES} selectedName="gateway" />);
    expect(screen.getByRole("article", { name: "gateway" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("reports a selection by name", async () => {
    const onSelect = vi.fn();
    render(<ServiceHealthList services={SERVICES} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("article", { name: "audit-service" }));
    expect(onSelect).toHaveBeenCalledWith("audit-service");
  });

  it("says the filter matched nothing rather than showing an empty heading", () => {
    render(<ServiceHealthList services={[]} />);
    expect(screen.getByText("No services match this filter.")).toBeInTheDocument();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });
});
