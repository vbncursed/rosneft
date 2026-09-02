import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AlertInspector, type AlertInspectorProps, type FiringAlert } from "./alert-inspector";

const alert = (over: Partial<FiringAlert> = {}): FiringAlert => ({
  name: "HighErrorRate",
  meta: "gateway · severity: critical",
  firingFor: "14m",
  details: [
    { label: "expr", value: "rate(http_5xx[5m]) > 0.005" },
    { label: "value", value: "0.82%", tone: "bad" },
  ],
  series: { label: "5xx", values: [0.2, 0.5, 0.8], tone: "bad" },
  threshold: { share: 45, label: "0.5%" },
  contributors: [
    { path: "GET /api/territories/:slug", value: "412", share: 100 },
    { path: "POST /api/models/upload", value: "188", share: 46, tone: "warn" },
  ],
  ...over,
});

const props = (over: Partial<AlertInspectorProps> = {}): AlertInspectorProps => ({
  alert: alert(),
  onClose: vi.fn(),
  onSilence: vi.fn(),
  onOpenInAudit: vi.fn(),
  onCopyPromQl: vi.fn(),
  ...over,
});

describe("AlertInspector", () => {
  it("is a region named after the alert, saying how long it has fired", () => {
    render(<AlertInspector {...props()} />);
    expect(screen.getByRole("complementary", { name: "Alert: HighErrorRate" })).toBeInTheDocument();
    expect(screen.getByText("Firing · 14m")).toBeInTheDocument();
    expect(screen.getByText("gateway · severity: critical")).toBeInTheDocument();
  });

  it("plots the series against its threshold", () => {
    render(<AlertInspector {...props()} />);
    expect(screen.getByRole("img", { name: /5xx rate vs threshold/ })).toBeInTheDocument();
    expect(screen.getByText("0.5%")).toBeInTheDocument();
  });

  it("omits the threshold line when there is none", () => {
    render(<AlertInspector {...props({ alert: alert({ threshold: undefined }) })} />);
    expect(screen.queryByText("0.5%")).not.toBeInTheDocument();
  });

  it("lists the rule's facts", () => {
    render(<AlertInspector {...props()} />);
    expect(screen.getByText("rate(http_5xx[5m]) > 0.005")).toBeInTheDocument();
    expect(screen.getByText("0.82%").className).toContain("text-bad");
  });

  it("ranks the contributors, each with a share of the worst", () => {
    render(<AlertInspector {...props()} />);
    expect(screen.getByText("GET /api/territories/:slug")).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "GET /api/territories/:slug share" }),
    ).toHaveAttribute("aria-valuenow", "100");
  });

  it("shows no contributor block when there are none", () => {
    render(<AlertInspector {...props({ alert: alert({ contributors: [] }) })} />);
    expect(screen.queryByText("Top contributors")).not.toBeInTheDocument();
  });

  it("runs the three actions", async () => {
    const p = props();
    render(<AlertInspector {...p} />);

    for (const [name, fn] of [
      ["Silence 1h", p.onSilence],
      ["Open in audit", p.onOpenInAudit],
      ["Copy PromQL", p.onCopyPromQl],
      ["Close", p.onClose],
    ] as const) {
      await userEvent.click(screen.getByRole("button", { name }));
      expect(fn).toHaveBeenCalledOnce();
    }
  });
});
