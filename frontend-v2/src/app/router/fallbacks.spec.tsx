import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { NoConsoleAccess, NotFound, RouteError } from "./fallbacks";

// A route can throw anything, so the prop is deliberately `unknown` here.
const errorProps = (error: unknown) =>
  ({ error, reset: () => {}, info: undefined }) as unknown as ErrorComponentProps;

describe("router fallbacks", () => {
  it("offers a mistyped URL a way back into the app", () => {
    render(<NotFound />);
    expect(screen.getByRole("heading", { level: 1, name: "Page not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to the console" })).toHaveAttribute(
      "href",
      "/console",
    );
  });

  it("shows what the failure said when it said anything", () => {
    render(<RouteError {...errorProps(new Error("Scene bundle unavailable"))} />);
    expect(screen.getByText("Scene bundle unavailable")).toBeInTheDocument();
  });

  // A route can throw anything, and "undefined" on screen is worse than a
  // sentence — as is an Error carrying an empty message.
  it("falls back to a sentence for a thrown non-Error", () => {
    render(<RouteError {...errorProps("boom")} />);
    expect(screen.getByText("This page could not be loaded.")).toBeInTheDocument();

    render(<RouteError {...errorProps(new Error(""))} />);
    expect(screen.getAllByText("This page could not be loaded.")).toHaveLength(2);
  });

  it("tells an account with no console permissions what to do about it", () => {
    render(<NoConsoleAccess />);
    expect(screen.getByRole("heading", { level: 1, name: "No console access" })).toBeInTheDocument();
    expect(screen.getByText(/organisation owner/)).toBeInTheDocument();
  });
});
