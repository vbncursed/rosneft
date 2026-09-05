import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FileCard } from "./file-card";

describe("FileCard", () => {
  it("names the file and its metadata", () => {
    render(<FileCard name="refinery-block-c.zip" meta="2.4 GB · OBJ + MTL + 38 textures" />);
    expect(screen.getByText("refinery-block-c.zip")).toBeInTheDocument();
    expect(screen.getByText("2.4 GB · OBJ + MTL + 38 textures")).toBeInTheDocument();
  });

  it("offers a way to replace the file", async () => {
    const onReplace = vi.fn();
    render(<FileCard name="a.zip" meta="1 MB" onReplace={onReplace} />);
    await userEvent.click(screen.getByRole("button", { name: "Replace" }));
    expect(onReplace).toHaveBeenCalledOnce();
  });

  it("renders no replace control without a handler", () => {
    render(<FileCard name="a.zip" meta="1 MB" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("honours a custom replace label", () => {
    render(<FileCard name="a.zip" meta="1 MB" onReplace={() => {}} replaceLabel="Change" />);
    expect(screen.getByRole("button", { name: "Change" })).toBeInTheDocument();
  });
});
