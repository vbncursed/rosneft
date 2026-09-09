import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PasskeyRow } from "./passkey-row";
import type { Passkey } from "../model/passkey";

const passkey: Passkey = {
  id: "k1",
  name: "MacBook Pro",
  createdAt: "2026-08-12T09:20:00Z",
  lastUsedAt: "2026-09-07T18:02:00Z",
};

describe("PasskeyRow", () => {
  it("shows the name and the meta line", () => {
    render(<PasskeyRow passkey={passkey} onRemove={vi.fn()} />);
    expect(screen.getByText("MacBook Pro")).toBeInTheDocument();
    expect(screen.getByText("Added 12.08.2026 · last used 07.09.2026")).toBeInTheDocument();
  });

  // A list of these renders one "Remove" per key, and several controls with
  // the same accessible name are indistinguishable to a screen reader. The
  // visible label stays the design's bare "Remove".
  it("names the control after the key it removes", () => {
    render(<PasskeyRow passkey={passkey} onRemove={vi.fn()} />);
    const remove = screen.getByRole("button", { name: "Remove MacBook Pro" });
    expect(remove).toHaveTextContent("Remove");
  });

  it("fires onRemove when the Remove control is clicked", () => {
    const onRemove = vi.fn();
    render(<PasskeyRow passkey={passkey} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove MacBook Pro" }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("disables the Remove control while a removal is in flight", () => {
    render(<PasskeyRow passkey={passkey} onRemove={vi.fn()} busy />);
    expect(screen.getByRole("button", { name: "Remove MacBook Pro" })).toBeDisabled();
  });
});
