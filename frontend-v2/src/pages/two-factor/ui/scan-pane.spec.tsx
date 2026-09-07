import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearNotices } from "@/shared/lib/notify";
import { Toaster } from "@/widgets/toaster";
import { ScanPane } from "./scan-pane";

const SECRET = "JBSWY3DPEHPK3PXP";
const URL = `otpauth://totp/Andrey:t.throwaway?secret=${SECRET}&issuer=Andrey`;

beforeEach(() => clearNotices());
afterEach(() => vi.unstubAllGlobals());

const stubClipboard = (writeText: ReturnType<typeof vi.fn>) =>
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });

describe("ScanPane", () => {
  it("draws no QR until the gateway has answered — an empty code scans as nothing", () => {
    render(<ScanPane secret="" otpauthUrl="" />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Preparing the QR code" })).toBeInTheDocument();
  });

  it("renders the QR for the pairing URL the gateway issued", () => {
    render(<ScanPane secret={SECRET} otpauthUrl={URL} />);
    expect(screen.getByRole("img", { name: "Two-factor pairing QR code" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  // The key is a credential: it stays folded away until someone asks, and the
  // toggle says so both ways rather than only changing colour.
  it("keeps the manual key folded away until it is asked for", async () => {
    render(<ScanPane secret={SECRET} otpauthUrl={URL} />);
    const toggle = screen.getByRole("button", { name: "Can't scan? Show manual key" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(SECRET)).not.toBeInTheDocument();

    await userEvent.click(toggle);

    expect(screen.getByText(SECRET)).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("copies the secret itself, not the pairing URL around it", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup({ writeToClipboard: false });
    stubClipboard(writeText);

    render(<ScanPane secret={SECRET} otpauthUrl={URL} />);
    await user.click(screen.getByRole("button", { name: "Can't scan? Show manual key" }));
    await user.click(screen.getByRole("button", { name: "Copy" }));

    expect(writeText).toHaveBeenCalledWith(SECRET);
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("says so when the clipboard refuses, instead of claiming a copy that never happened", async () => {
    const user = userEvent.setup({ writeToClipboard: false });
    stubClipboard(vi.fn().mockRejectedValue(new Error("denied")));

    render(
      <>
        <Toaster />
        <ScanPane secret={SECRET} otpauthUrl={URL} />
      </>,
    );
    await user.click(screen.getByRole("button", { name: "Can't scan? Show manual key" }));
    await user.click(screen.getByRole("button", { name: "Copy" }));

    expect(await screen.findByText("Could not copy — select it and copy by hand")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copied" })).not.toBeInTheDocument();
  });
});
