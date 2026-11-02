import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TagRow } from "./tag-row";

const camps = { slug: "camps", title: "Camps" };
const renderRow = (onRename = vi.fn().mockResolvedValue(null), tag = camps) => {
  render(
    <ul>
      <TagRow tag={tag} onRename={onRename} />
    </ul>,
  );
  return onRename;
};

describe("TagRow", () => {
  it("shows the title and the slug", () => {
    renderRow();
    expect(screen.getByText("Camps")).toBeInTheDocument();
    expect(screen.getByText("camps")).toBeInTheDocument();
  });

  it("is read-only for the built-in ungrouped tag", () => {
    renderRow(undefined, { slug: "ungrouped", title: "Ungrouped" });
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Built in, cannot be changed")).toBeInTheDocument();
  });

  it("renames inline and closes the editor on success", async () => {
    const user = userEvent.setup();
    const onRename = renderRow();
    await user.click(screen.getByRole("button", { name: "Rename Camps" }));
    const input = screen.getByRole("textbox", { name: "Title for Camps" });
    expect(input).toHaveValue("Camps");
    await user.clear(input);
    await user.type(input, "Camp sites");
    await user.click(screen.getByRole("button", { name: "Save title for Camps" }));
    expect(onRename).toHaveBeenCalledWith("Camp sites");
    expect(await screen.findByRole("button", { name: "Rename Camps" })).toBeInTheDocument();
  });

  it("blocks a blank title before any request", async () => {
    const user = userEvent.setup();
    const onRename = renderRow();
    await user.click(screen.getByRole("button", { name: "Rename Camps" }));
    await user.clear(screen.getByRole("textbox", { name: "Title for Camps" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a title.");
    expect(screen.getByRole("button", { name: "Save title for Camps" })).toBeDisabled();
    expect(onRename).not.toHaveBeenCalled();
  });

  it("keeps the editor open and prints the server's refusal", async () => {
    const user = userEvent.setup();
    renderRow(vi.fn().mockResolvedValue("invalid input: a model tag with this slug or title already exists"));
    await user.click(screen.getByRole("button", { name: "Rename Camps" }));
    await user.type(screen.getByRole("textbox", { name: "Title for Camps" }), "x");
    await user.click(screen.getByRole("button", { name: "Save title for Camps" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("a model tag with this slug or title already exists");
    expect(screen.getByRole("textbox", { name: "Title for Camps" })).toBeInTheDocument();
  });

  it("cancels with the button and with Escape, without a request", async () => {
    const user = userEvent.setup();
    const onRename = renderRow();
    await user.click(screen.getByRole("button", { name: "Rename Camps" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("textbox")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Rename Camps" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(onRename).not.toHaveBeenCalled();
  });
});
