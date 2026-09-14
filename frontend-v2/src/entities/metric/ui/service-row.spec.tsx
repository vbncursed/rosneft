import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ServiceRow } from "./service-row";
import type { ServiceHealth } from "../model/service";

const service = (over: Partial<ServiceHealth> = {}): ServiceHealth => ({
  name: "gateway",
  state: "up",
  meta: "5xx 0.82% · 142 rps · 3 replicas",
  samples: [10, 20, 15, 30],
  latency: "18ms",
  errors: "1.2/s",
  ...over,
});

describe("ServiceRow", () => {
  it("names the service and its readings", () => {
    render(<ServiceRow service={service()} />);
    expect(screen.getByText("gateway")).toBeInTheDocument();
    expect(screen.getByText("18ms")).toBeInTheDocument();
    expect(screen.getByText("1.2/s")).toBeInTheDocument();
    expect(screen.getByText(/142 rps/)).toBeInTheDocument();
  });

  it("writes the state out and colours the rail to match", () => {
    const { container, rerender } = render(<ServiceRow service={service()} />);
    expect(screen.getByText("up")).toBeInTheDocument();
    expect(container.querySelector("span[aria-hidden]")!.className).toContain("bg-ok");

    rerender(<ServiceRow service={service({ state: "degraded" })} />);
    expect(container.querySelector("span[aria-hidden]")!.className).toContain("bg-warn");

    rerender(<ServiceRow service={service({ state: "down" })} />);
    expect(container.querySelector("span[aria-hidden]")!.className).toContain("bg-bad");
  });

  it("marks a service that is not answering, whatever else is selected", () => {
    const { container } = render(<ServiceRow service={service({ state: "down" })} selected />);
    expect(container.firstElementChild!.className).toContain("border-bad");
  });

  it("dims the readings of a service that is not being scraped", () => {
    render(<ServiceRow service={service({ state: "down", latency: "—", errors: "—" })} />);
    expect(screen.getAllByText("—")[0].className).toContain("text-dim");
  });

  it("shows recent throughput, with the newest sample accented", () => {
    render(<ServiceRow service={service()} />);
    expect(
      screen.getByRole("img", { name: /gateway throughput: 4 buckets, latest 30/ }),
    ).toBeInTheDocument();
  });

  it("selects on click", async () => {
    const onSelect = vi.fn();
    render(<ServiceRow service={service()} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("article", { name: "gateway" }));
    expect(onSelect).toHaveBeenCalledOnce();
  });
});
