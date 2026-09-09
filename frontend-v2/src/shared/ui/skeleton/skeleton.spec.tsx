import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Skeleton } from "./skeleton";

describe("Skeleton", () => {
  it("is invisible to assistive tech — it stands in for content, it is not content", () => {
    render(<Skeleton />);
    expect(screen.queryByRole("presentation")).not.toBeInTheDocument();
    expect(document.querySelector("[aria-hidden='true']")).toBeInTheDocument();
  });

  it("takes the size it is given", () => {
    const { container } = render(<Skeleton width="60%" height="80px" />);
    const bar = container.firstElementChild as HTMLElement;
    expect(bar.style.width).toBe("60%");
    expect(bar.style.height).toBe("80px");
  });

  it("stops pulsing for a reduced-motion viewer", () => {
    const { container } = render(<Skeleton />);
    expect(container.firstElementChild!.className).toContain("motion-reduce:animate-none");
  });
});
