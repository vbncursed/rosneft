import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Card } from "./card";
import { EmptyState } from "./empty-state";
import { ErrorState } from "./error-state";

describe("Card", () => {
  it("renders bare content with no header", () => {
    render(<Card>body</Card>);
    expect(screen.getByText("body")).toBeInTheDocument();
  });

  it("shows a header with a title and its actions", () => {
    render(
      <Card title="Users" actions={<button type="button">+ New user</button>}>
        rows
      </Card>,
    );
    expect(screen.getByText("Users")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ New user" })).toBeInTheDocument();
    expect(screen.getByText("rows")).toBeInTheDocument();
  });

  it("renders an overline above the body", () => {
    render(<Card overline="Progress · upload">body</Card>);
    expect(screen.getByText("Progress · upload")).toBeInTheDocument();
  });

  it("drops its own padding so a table can reach the edges", () => {
    const { container } = render(
      <Card padded={false}>
        <table />
      </Card>,
    );
    expect(container.firstElementChild!.className).not.toContain("p-5");
  });
});

describe("EmptyState", () => {
  it("names the gap and offers the way out", () => {
    render(
      <EmptyState
        title="Catalog is empty"
        description="Upload your first territory."
        action={<button type="button">+ Upload</button>}
      />,
    );
    expect(screen.getByText("Catalog is empty")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Upload" })).toBeInTheDocument();
  });
});

describe("ErrorState", () => {
  it("announces itself and carries the technical detail", () => {
    render(
      <ErrorState title="Could not load the journal" detail="HTTP 503 · audit-service unavailable" />,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Could not load the journal");
    expect(alert).toHaveTextContent("HTTP 503 · audit-service unavailable");
  });
});
