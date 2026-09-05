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

    fireEvent.dragOver(zone);
    expect(zone.className).toContain("border-accent");

    fireEvent.dragLeave(zone);
    expect(zone.className).not.toContain("border-accent");

    fireEvent.dragEnter(zone);
    const file = new File(["x"], "a.zip");
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    expect(onFiles).toHaveBeenCalledWith([file]);
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
