import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TagAddForm } from "./tag-add-form";

const setup = (outcome: string | null = null) => {
  const onCreate = vi.fn().mockResolvedValue(outcome);
  render(<TagAddForm onCreate={onCreate} />);
  return { onCreate, user: userEvent.setup() };
};

describe("TagAddForm", () => {
  it("shows the slug and title errors on submit and sends nothing", async () => {
    const { onCreate, user } = setup();
    await user.click(screen.getByRole("button", { name: "Add tag" }));
    expect(screen.getByText("Enter a slug.")).toBeInTheDocument();
    expect(screen.getByText("Enter a title.")).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("refuses a slug the server would", async () => {
    const { onCreate, user } = setup();
    await user.type(screen.getByLabelText("Slug"), "Tank Farms");
    await user.type(screen.getByLabelText("Title"), "Tank farms");
    await user.click(screen.getByRole("button", { name: "Add tag" }));
    expect(screen.getByText("Use lowercase letters, digits and single hyphens.")).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("creates and clears the form", async () => {
    const { onCreate, user } = setup();
    await user.type(screen.getByLabelText("Slug"), "tank-farms");
    await user.type(screen.getByLabelText("Title"), "Tank farms");
    await user.click(screen.getByRole("button", { name: "Add tag" }));
    expect(onCreate).toHaveBeenCalledWith({ slug: "tank-farms", title: "Tank farms" });
    expect(await screen.findByLabelText("Slug")).toHaveValue("");
    expect(screen.getByLabelText("Title")).toHaveValue("");
  });

  it("keeps the input and prints a 400 under the form", async () => {
    const { user } = setup("invalid input: a model tag with this slug or title already exists");
    await user.type(screen.getByLabelText("Slug"), "camps");
    await user.type(screen.getByLabelText("Title"), "Camps");
    await user.click(screen.getByRole("button", { name: "Add tag" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already exists");
    expect(screen.getByLabelText("Slug")).toHaveValue("camps");
  });
});
