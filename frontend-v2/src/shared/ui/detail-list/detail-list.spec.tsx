import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DetailList } from "./detail-list";

describe("DetailList", () => {
  it("pairs each label with its value", () => {
    const { container } = render(
      <DetailList
        items={[
          { label: "actor", value: "a.ivanova" },
          { label: "ip", value: "10.42.0.18" },
        ]}
      />,
    );
    expect([...container.querySelectorAll("dt")].map((d) => d.textContent)).toEqual([
      "actor",
      "ip",
    ]);
    expect(screen.getByText("10.42.0.18")).toBeInTheDocument();
  });

  it("keeps the order it was given", () => {
    const { container } = render(
      <DetailList items={[{ label: "z", value: "1" }, { label: "a", value: "2" }]} />,
    );
    expect([...container.querySelectorAll("dt")].map((d) => d.textContent)).toEqual(["z", "a"]);
  });

  it("tones a value when asked", () => {
    render(<DetailList items={[{ label: "result", value: "ok", tone: "ok" }]} />);
    expect(screen.getByText("ok").className).toContain("text-ok");
  });

  it("defaults a value to the foreground ink", () => {
    render(<DetailList items={[{ label: "ip", value: "10.42.0.18" }]} />);
    expect(screen.getByText("10.42.0.18").className).toContain("text-fg");
  });

  it("breaks a long value rather than widening the panel", () => {
    render(<DetailList items={[{ label: "digest", value: "sha256:9c1f" }]} />);
    expect(screen.getByText("sha256:9c1f").className).toContain("break-all");
  });

  it("renders nothing at all when there is nothing to show", () => {
    const { container } = render(<DetailList items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
