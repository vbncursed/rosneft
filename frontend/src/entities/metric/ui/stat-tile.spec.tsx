import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatTile } from "./stat-tile";

describe("StatTile", () => {
  it("shows the label and the reading", () => {
    render(<StatTile label="Req/s" state={{ kind: "value", value: "142" }} />);
    expect(screen.getByText("Req/s")).toBeInTheDocument();
    expect(screen.getByText("142")).toBeInTheDocument();
  });

  it("spells out a waiting tile, so the glyph is not the only cue", () => {
    render(<StatTile label="P95" state={{ kind: "loading" }} />);
    expect(screen.getByText("P95: loading")).toBeInTheDocument();
    expect(screen.getByText("…")).toBeInTheDocument();
  });

  it("spells out an unavailable tile, so red is not the only cue", () => {
    render(<StatTile label="Error rate" state={{ kind: "unavailable" }} />);
    expect(screen.getByText("Error rate: unavailable")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("distinguishes waiting from failing — a spinner must not hide an outage", () => {
    const { rerender } = render(<StatTile label="P95" state={{ kind: "loading" }} />);
    expect(screen.getByText("P95: loading").parentElement!.className).toContain("text-muted");

    rerender(<StatTile label="P95" state={{ kind: "unavailable" }} />);
    expect(screen.getByText("P95: unavailable").parentElement!.className).toContain("text-bad");
  });
});

describe("StatTile · console variant", () => {
  it("shows a hint under the number when given one", () => {
    render(
      <StatTile label="Accounts" state={{ kind: "value", value: "26" }} hint="24 active · 2 frozen" />,
    );
    expect(screen.getByText("24 active · 2 frozen")).toBeInTheDocument();
  });

  it("omits the hint line entirely when there is none", () => {
    const { container } = render(<StatTile label="Accounts" state={{ kind: "value", value: "26" }} />);
    expect(container.querySelectorAll("p")).toHaveLength(2);
  });

  it("takes the tone it is told for a settled value", () => {
    const { rerender } = render(
      <StatTile label="Needs attention" state={{ kind: "value", value: "5" }} tone="bad" />,
    );
    expect(screen.getByText("Needs attention: 5").parentElement!.className).toContain("text-bad");

    rerender(<StatTile label="Accounts" state={{ kind: "value", value: "26" }} tone="fg" />);
    expect(screen.getByText("Accounts: 26").parentElement!.className).toContain("text-fg");
  });

  it("keeps the loading and failure tones whatever the caller asks for", () => {
    const { rerender } = render(<StatTile label="P95" state={{ kind: "loading" }} tone="fg" />);
    expect(screen.getByText("P95: loading").parentElement!.className).toContain("text-muted");

    rerender(<StatTile label="P95" state={{ kind: "unavailable" }} tone="fg" />);
    expect(screen.getByText("P95: unavailable").parentElement!.className).toContain("text-bad");
  });

  it("sets the console size larger than the dashboard one", () => {
    const { rerender } = render(<StatTile label="A" state={{ kind: "value", value: "1" }} />);
    expect(screen.getByText("A: 1").parentElement!.className).toContain("text-[22px]");

    rerender(<StatTile label="A" state={{ kind: "value", value: "1" }} size="lg" />);
    expect(screen.getByText("A: 1").parentElement!.className).toContain("text-[26px]");
  });
});

describe("StatTile · bare", () => {
  it("drops the frame so a caller can group several in one panel", () => {
    const { container } = render(
      <StatTile bare label="Today" state={{ kind: "value", value: "312" }} />,
    );
    const cls = container.firstElementChild!.className;
    expect(cls).not.toContain("border-line");
    expect(cls).not.toContain("bg-panel");
  });

  it("still reads the same to assistive tech", () => {
    render(<StatTile bare label="Failed" state={{ kind: "value", value: "4" }} tone="bad" />);
    expect(screen.getByText("Failed: 4")).toBeInTheDocument();
  });
});

describe("StatTile · delta", () => {
  it("shows the change beside the label", () => {
    render(<StatTile label="Requests/sec" state={{ kind: "value", value: "142/s" }} delta="+8%" />);
    expect(screen.getByText("+8%")).toBeInTheDocument();
  });

  it("tones the delta by whether it is good news, not by its sign", () => {
    const { rerender } = render(
      <StatTile label="p99" state={{ kind: "value", value: "452ms" }} delta="−12%" deltaTone="ok" />,
    );
    expect(screen.getByText("−12%").className).toContain("text-ok");

    rerender(
      <StatTile label="Error rate" state={{ kind: "value", value: "0.82%" }} delta="+0.3" deltaTone="bad" />,
    );
    expect(screen.getByText("+0.3").className).toContain("text-bad");
  });

  it("shows nothing extra when there is no delta", () => {
    render(<StatTile label="Sessions" state={{ kind: "value", value: "37" }} />);
    expect(screen.getByText("Sessions").parentElement!.childElementCount).toBe(1);
  });
});
