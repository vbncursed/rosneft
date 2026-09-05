import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ModelCard } from "./model-card";
import type { Model } from "../model/model";

const MODEL: Model = {
  slug: "flare-stack",
  title: "Flare Stack",
  description: "Elevated flare with knockout drum.",
  sourceBlobHash: "abc",
};

describe("ModelCard", () => {
  it("links a ready model to its detail route", () => {
    render(<ModelCard model={MODEL} conversion={{ status: "ready" }} />);
    expect(screen.getByRole("link", { name: "Flare Stack" })).toHaveAttribute(
      "href",
      "/models/flare-stack",
    );
  });

  it("names itself a Model, not a Territory", () => {
    render(<ModelCard model={MODEL} conversion={{ status: "ready" }} />);
    expect(screen.getByText("Model")).toBeInTheDocument();
  });

  it("greys out and unlinks a model still converting", () => {
    render(<ModelCard model={MODEL} conversion={{ status: "converting", progress: 42 }} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("42%")).toBeInTheDocument();
  });

  it("shows actions in place of the badge", () => {
    render(
      <ModelCard
        model={MODEL}
        conversion={{ status: "ready" }}
        actions={<button type="button">Delete</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.queryByText("ready")).not.toBeInTheDocument();
  });
});
