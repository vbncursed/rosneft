import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NotFoundView, type NotFoundKind } from "./not-found-view";

afterEach(() => window.history.replaceState(null, "", "/"));

describe("NotFoundView", () => {
  it.each<[NotFoundKind, string, string, string]>([
    ["page", "This page doesn't exist", "Go to territories", "/territories"],
    ["territory", "No territory at this address", "Browse territories", "/territories"],
    ["model", "No model at this address", "Browse models", "/models"],
  ])("%s: names what is missing and offers the way out", (kind, title, primary, href) => {
    render(<NotFoundView kind={kind} path="/x" />);
    expect(screen.getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
    expect(screen.getByText("Error 404 · not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: primary })).toHaveAttribute("href", href);
    expect(screen.getByRole("link", { name: "Go to home" })).toHaveAttribute("href", "/");
  });

  it("shows the address that was asked for", () => {
    render(<NotFoundView kind="page" path="/admin/reports" />);
    expect(screen.getByText("Requested")).toBeInTheDocument();
    // Once in the Requested plate, once on the (decorative) scene plate.
    expect(screen.getAllByText("/admin/reports")).toHaveLength(2);
  });

  it("reads the live address when none is given", () => {
    window.history.replaceState(null, "", "/territories/refinery-block-x");
    render(<NotFoundView kind="territory" />);
    expect(screen.getAllByText("/territories/refinery-block-x")).toHaveLength(2);
  });

  // The scene repeats the path and says nothing the text column does not;
  // a screen reader should meet it once, in the Requested plate.
  it("hides the illustration from assistive technology", () => {
    const { container } = render(<NotFoundView kind="page" path="/x" />);
    expect(container.querySelector("[aria-hidden='true'] svg")).not.toBeNull();
    expect(screen.getByText("measure · second point not found").closest("[aria-hidden='true']")).not.toBeNull();
  });
});
