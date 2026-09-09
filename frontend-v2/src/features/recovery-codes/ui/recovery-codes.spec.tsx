import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearNotices } from "@/shared/lib/notify";
import { Toaster } from "@/widgets/toaster";
import { downloadText } from "../model/download";
import { RecoveryCodes } from "./recovery-codes";

vi.mock("../model/download", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../model/download")>()),
  downloadText: vi.fn(),
}));

const CODES = ["8k2fq-p1x7d", "m4wla-9zt3c", "qq08r-vb51n"];

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(downloadText).mockClear();
  clearNotices();
});

describe("RecoveryCodes", () => {
  it("lists every code", () => {
    render(<RecoveryCodes codes={CODES} onConfirm={() => {}} />);
    for (const code of CODES) expect(screen.getByText(code)).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("copies every code as one newline-separated block", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup({ writeToClipboard: false });
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });

    render(<RecoveryCodes codes={CODES} onConfirm={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Copy all" }));

    expect(writeText).toHaveBeenCalledWith("8k2fq-p1x7d\nm4wla-9zt3c\nqq08r-vb51n\n");
  });

  it("confirms the copy happened, so the click is not silent", async () => {
    const user = userEvent.setup({ writeToClipboard: false });
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });

    render(<RecoveryCodes codes={CODES} onConfirm={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Copy all" }));

    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("leaves the label as Copy when the clipboard refuses, and toasts the reason", async () => {
    const user = userEvent.setup({ writeToClipboard: false });
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });

    render(
      <>
        <Toaster />
        <RecoveryCodes codes={CODES} onConfirm={() => {}} />
      </>,
    );
    await user.click(screen.getByRole("button", { name: "Copy all" }));

    expect(await screen.findByRole("button", { name: "Copy all" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copied" })).not.toBeInTheDocument();
    expect(
      await screen.findByText("Could not copy — select it and copy by hand"),
    ).toBeInTheDocument();
  });

  it("hands the codes to the downloader under a named file", async () => {
    render(<RecoveryCodes codes={CODES} onConfirm={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Download .txt" }));

    // What the download does with them is download.spec.ts's business; this
    // asserts the button reaches it with the right file.
    expect(downloadText).toHaveBeenCalledWith(
      "recovery-codes.txt",
      "8k2fq-p1x7d\nm4wla-9zt3c\nqq08r-vb51n\n",
    );
  });

  // The host draws the green card and the "Step N · save these recovery codes"
  // heading. This drew both again, so the sentence appeared twice and two ok
  // grounds nested. It is the grid and the actions, nothing around them.
  it("draws no card and no heading of its own", () => {
    const { container } = render(<RecoveryCodes codes={CODES} onConfirm={() => {}} />);
    expect(screen.queryByText(/save these recovery codes/i)).not.toBeInTheDocument();
    // The green pill on "I saved them" is the design; a green card around the
    // whole block is the duplicate.
    expect(container.firstElementChild!.className).not.toMatch(/border-ok|bg-ok-soft/);
  });

  it("lays the codes out as the design does: an auto-fit grid, not two fixed columns", () => {
    render(<RecoveryCodes codes={CODES} onConfirm={() => {}} />);
    const grid = screen.getAllByRole("listitem")[0]!.parentElement!;
    expect(grid.className).toContain("minmax(128px,1fr)");
    expect(grid.className).toContain("gap-[7px]");
  });

  it("dresses the three actions as the design does: two plain pills, one green", () => {
    render(<RecoveryCodes codes={CODES} onConfirm={() => {}} />);
    for (const name of ["Copy all", "Download .txt"]) {
      expect(screen.getByRole("button", { name }).className).toContain("bg-transparent");
    }
    expect(screen.getByRole("button", { name: "I saved them" }).className).toContain("bg-ok-soft");
  });

  it("does not dismiss itself — only the person confirming can", async () => {
    const onConfirm = vi.fn();
    render(<RecoveryCodes codes={CODES} onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole("button", { name: "I saved them" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
