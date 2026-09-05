import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { UploadForm } from "../model/upload-form";
import { UploadDetails } from "./upload-details";

const form = (over: Partial<UploadForm> = {}): UploadForm => ({
  title: "",
  description: "",
  panoramaUrl: "",
  ...over,
});

describe("UploadDetails", () => {
  it("names the section and says the slug is derived from the title", () => {
    render(<UploadDetails form={form()} onForm={vi.fn()} slug="" />);
    expect(screen.getByText("Details")).toBeInTheDocument();
    expect(screen.getByText("slug is generated from the title")).toBeInTheDocument();
  });

  it("requires a title and reports every keystroke", async () => {
    const onForm = vi.fn();
    render(<UploadDetails form={form()} onForm={onForm} slug="" />);
    const title = screen.getByLabelText("Title", { exact: false });
    expect(title).toBeRequired();
    await userEvent.type(title, "x");
    expect(onForm).toHaveBeenCalledWith({ title: "x" });
  });

  it("shows the live slug preview beside its dimmed label", () => {
    render(<UploadDetails form={form({ title: "Refinery Block C" })} onForm={vi.fn()} slug="refinery-block-c" />);
    expect(screen.getByText("slug")).toBeInTheDocument();
    expect(screen.getByText("refinery-block-c")).toBeInTheDocument();
  });

  it("edits the description", async () => {
    const onForm = vi.fn();
    render(<UploadDetails form={form()} onForm={onForm} slug="" />);
    await userEvent.type(screen.getByLabelText("Description"), "x");
    expect(onForm).toHaveBeenCalledWith({ description: "x" });
  });

  it("names the optional panorama field and shows its hint", async () => {
    const onForm = vi.fn();
    render(<UploadDetails form={form()} onForm={onForm} slug="" />);
    expect(
      screen.getByText(
        "Optional. Link to an externally-hosted 360° tour — shown as a button in the viewer.",
      ),
    ).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Panorama tour URL"), "x");
    expect(onForm).toHaveBeenCalledWith({ panoramaUrl: "x" });
  });
});
