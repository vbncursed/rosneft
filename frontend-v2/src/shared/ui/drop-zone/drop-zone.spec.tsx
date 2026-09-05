import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DropZone } from "./drop-zone";

describe("DropZone", () => {
  it("hands the picked files to onFiles and labels the hidden input", async () => {
    const onFiles = vi.fn();
    render(
      <DropZone
        label="Drop ZIP archives here"
        hint="Or pick several at once"
        buttonLabel="Choose files"
        accept=".zip"
        multiple
        onFiles={onFiles}
      />,
    );
    const input = screen.getByLabelText("Drop ZIP archives here") as HTMLInputElement;
    expect(input.accept).toBe(".zip");
    expect(input.multiple).toBe(true);
    const a = new File(["x"], "a.zip");
    const b = new File(["y"], "b.zip");
    await userEvent.upload(input, [a, b]);
    expect(onFiles).toHaveBeenCalledWith([a, b]);
  });

  it("clears the input's value after a pick, so choosing the same file again still fires a change", async () => {
    render(
      <DropZone
        label="Drop ZIP archives here"
        hint="hint"
        buttonLabel="Choose files"
        accept=".zip"
        onFiles={vi.fn()}
      />,
    );
    const input = screen.getByLabelText("Drop ZIP archives here") as HTMLInputElement;
    await userEvent.upload(input, new File(["x"], "a.zip"));
    expect(input.value).toBe("");
  });

  it("accepts a drop and highlights while a file is over it", () => {
    const onFiles = vi.fn();
    const { container } = render(
      <DropZone
        label="Drop ZIP archives here"
        hint="Or pick several at once"
        buttonLabel="Choose files"
        accept=".zip"
        onFiles={onFiles}
      />,
    );
    const zone = container.firstElementChild as HTMLElement;
    fireEvent.dragEnter(zone);
    expect(zone.className).toContain("border-accent");
    expect(zone.className).not.toContain("border-line-2");

    const file = new File(["x"], "a.zip");
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    expect(onFiles).toHaveBeenCalledWith([file]);
  });

  it("stays highlighted across a dragover after a dragleave — crossing into a child bubbles a spurious leave", () => {
    const { container } = render(
      <DropZone
        label="Drop ZIP archives here"
        hint="hint"
        buttonLabel="Choose files"
        accept=".zip"
        onFiles={vi.fn()}
      />,
    );
    const zone = container.firstElementChild as HTMLElement;
    fireEvent.dragEnter(zone);
    expect(zone.className).toContain("border-accent");

    fireEvent.dragLeave(zone);
    expect(zone.className).not.toContain("border-accent");

    fireEvent.dragOver(zone);
    expect(zone.className).toContain("border-accent");
  });

  it("ignores a dropped file that does not match the accept extension", () => {
    const onFiles = vi.fn();
    const { container } = render(
      <DropZone
        label="Drop ZIP archives here"
        hint="hint"
        buttonLabel="Choose files"
        accept=".zip"
        onFiles={onFiles}
      />,
    );
    const zone = container.firstElementChild as HTMLElement;
    const file = new File(["x"], "a.txt");
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    expect(onFiles).not.toHaveBeenCalled();
  });

  it("opens the picker from the keyboard", () => {
    render(
      <DropZone
        label="Drop ZIP archives here"
        hint="Or pick several at once"
        buttonLabel="Choose files"
        accept=".zip"
        onFiles={vi.fn()}
      />,
    );
    const input = screen.getByLabelText("Drop ZIP archives here") as HTMLInputElement;
    const clickSpy = vi.spyOn(input, "click").mockImplementation(() => {});
    const zone = input.closest("label")!;
    fireEvent.keyDown(zone, { key: "Enter" });
    expect(clickSpy).toHaveBeenCalledOnce();
  });

  it("shows a visible focus ring on the zone, not just on the hidden input", () => {
    render(
      <DropZone
        label="Drop ZIP archives here"
        hint="hint"
        buttonLabel="Choose files"
        accept=".zip"
        onFiles={vi.fn()}
      />,
    );
    const input = screen.getByLabelText("Drop ZIP archives here") as HTMLInputElement;
    const zone = input.closest("label")!;
    expect(zone.className).toContain("focus-visible:outline-2");
    expect(zone.className).toContain("focus-visible:outline-accent");
  });

  it("keeps the hidden input out of tab order — the label is the one stop", () => {
    render(
      <DropZone
        label="Drop ZIP archives here"
        hint="hint"
        buttonLabel="Choose files"
        accept=".zip"
        onFiles={vi.fn()}
      />,
    );
    const input = screen.getByLabelText("Drop ZIP archives here") as HTMLInputElement;
    expect(input.tabIndex).toBe(-1);
  });

  it("does nothing while disabled", () => {
    const onFiles = vi.fn();
    const { container } = render(
      <DropZone
        label="Drop ZIP archives here"
        hint="Or pick several at once"
        buttonLabel="Choose files"
        accept=".zip"
        onFiles={onFiles}
        disabled
      />,
    );
    const zone = container.firstElementChild as HTMLElement;
    const input = screen.getByLabelText("Drop ZIP archives here") as HTMLInputElement;
    expect(input.disabled).toBe(true);

    const file = new File(["x"], "a.zip");
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    expect(onFiles).not.toHaveBeenCalled();

    const clickSpy = vi.spyOn(input, "click").mockImplementation(() => {});
    fireEvent.keyDown(zone, { key: "Enter" });
    expect(clickSpy).not.toHaveBeenCalled();
  });
});
