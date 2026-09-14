import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConsoleCard } from "./console-card";

describe("ConsoleCard", () => {
  it("is a link with the label and the count when open", () => {
    render(
      <ConsoleCard
        label="Users"
        href="/console/users"
        hint={{ kind: "count", text: "12 users" }}
        locked={false}
      />,
    );
    expect(screen.getByRole("link", { name: /Users/ })).toHaveAttribute("href", "/console/users");
    expect(screen.getByText("12 users")).toBeInTheDocument();
  });

  it("is no link when locked, says so through the lock, and reads the static hint", () => {
    render(
      <ConsoleCard
        label="Metrics"
        href="/console/metrics"
        hint={{ kind: "static", text: "conversion health and alerts" }}
        locked
      />,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "No access" })).toBeInTheDocument();
    expect(screen.getByText("Metrics").closest("[aria-disabled]")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByText("conversion health and alerts")).toBeInTheDocument();
  });

  it("prints count unavailable in the hint slot", () => {
    render(
      <ConsoleCard
        label="Roles & Permissions"
        href="/console/roles"
        hint={{ kind: "unavailable", text: "count unavailable" }}
        locked={false}
      />,
    );
    expect(screen.getByText("count unavailable")).toBeInTheDocument();
  });
});
