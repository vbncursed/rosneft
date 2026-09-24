import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StandaloneHeader } from "./standalone-header";

describe("StandaloneHeader", () => {
  it("makes the brand a way home when given one", () => {
    render(<StandaloneHeader brandHref="/" />);
    expect(screen.getByRole("link", { name: "Andrey Viewer" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("button", { name: /^Theme:/ })).toBeInTheDocument();
  });

  it("draws the brand as text, and whatever it is handed after the toggle", () => {
    render(
      <StandaloneHeader>
        <span>a.ivanova</span>
      </StandaloneHeader>,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("Andrey Viewer")).toBeInTheDocument();
    expect(screen.getByText("a.ivanova")).toBeInTheDocument();
  });
});
