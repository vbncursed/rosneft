import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RecordInspector } from "./record-inspector";
import type { AuditEntry } from "@/entities/audit";

const entry = (over: Partial<AuditEntry> = {}): AuditEntry => ({
  id: 1,
  at: "2026-09-01T09:14:00Z",
  actorId: "u-1",
  actorLogin: "a.ivanova",
  action: "territory.update",
  entity: "territory",
  entityId: "t-1",
  entityLabel: "Refinery Block C",
  oldRow: { title: "Refinery Block", legacy_slug: "block-c-old" },
  newRow: { title: "Refinery Block C", external_panorama_url: "https://tour.example.com/rbc" },
  result: "ok",
  ...over,
});

const props = { onCopyJson: vi.fn() };

describe("RecordInspector", () => {
  it("is a labelled region naming the action and its target", () => {
    render(<RecordInspector entry={entry()} {...props} />);
    const panel = screen.getByRole("complementary", { name: "Record inspector" });
    expect(panel).toHaveTextContent("territory.update");
    expect(panel).toHaveTextContent("Refinery Block C");
  });

  it("lists the facts it is handed, in order", () => {
    render(
      <RecordInspector
        entry={entry()}
        details={[
          { label: "actor", value: "a.ivanova · Company Owner" },
          { label: "ip", value: "10.42.0.18" },
          { label: "result", value: "ok", tone: "ok" },
        ]}
        {...props}
      />,
    );
    expect(screen.getByText("a.ivanova · Company Owner")).toBeInTheDocument();
    expect(screen.getByText("10.42.0.18")).toBeInTheDocument();
    expect(screen.getByText("ok").className).toContain("text-ok");
  });

  it("shows no fact block when it was given none", () => {
    render(<RecordInspector entry={entry()} {...props} />);
    expect(document.querySelector("dl")).toBeNull();
  });

  it("names the record in the overline when an id is known", () => {
    const { rerender } = render(<RecordInspector entry={entry()} {...props} />);
    expect(screen.getByText("Record inspector")).toBeInTheDocument();

    rerender(<RecordInspector entry={entry()} recordId="4f21c8" {...props} />);
    expect(screen.getByText("Record · 4f21c8")).toBeInTheDocument();
  });

  it("counts the changed fields in the heading", () => {
    render(<RecordInspector entry={entry()} {...props} />);
    expect(screen.getByText("Changed fields · 3")).toBeInTheDocument();
  });

  it("writes each changed field with its sign", () => {
    render(<RecordInspector entry={entry()} {...props} />);
    expect(screen.getByText('"Refinery Block" → "Refinery Block C"')).toBeInTheDocument();
    expect(screen.getByText('+ "https://tour.example.com/rbc"')).toBeInTheDocument();
    expect(screen.getByText('− "block-c-old"')).toBeInTheDocument();
  });

  it("colours the field name by what happened to it", () => {
    render(<RecordInspector entry={entry()} {...props} />);
    expect(screen.getByText("title").className).toContain("text-accent");
    expect(screen.getByText("external_panorama_url").className).toContain("text-ok");
    expect(screen.getByText("legacy_slug").className).toContain("text-bad");
  });

  it("says so when there is nothing to show", () => {
    render(<RecordInspector entry={entry({ oldRow: null, newRow: null })} {...props} />);
    expect(screen.getByText("No field-level changes recorded.")).toBeInTheDocument();
  });

  it("copies the record", async () => {
    const onCopyJson = vi.fn();
    render(<RecordInspector entry={entry()} onCopyJson={onCopyJson} />);
    await userEvent.click(screen.getByRole("button", { name: "Copy JSON" }));
    expect(onCopyJson).toHaveBeenCalledOnce();
  });

  it("offers no way into an entity that is gone", async () => {
    const onOpenEntity = vi.fn();
    const { rerender } = render(<RecordInspector entry={entry()} {...props} />);
    expect(screen.queryByRole("button", { name: "Open entity" })).not.toBeInTheDocument();

    rerender(<RecordInspector entry={entry()} {...props} onOpenEntity={onOpenEntity} />);
    await userEvent.click(screen.getByRole("button", { name: "Open entity" }));
    expect(onOpenEntity).toHaveBeenCalledOnce();
  });
});

describe("RecordInspector · dismissing", () => {
  it("offers no close control when there is nothing to close to", () => {
    render(<RecordInspector entry={entry()} {...props} />);
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
  });

  it("closes through the header control", async () => {
    const onClose = vi.fn();
    render(<RecordInspector entry={entry()} {...props} onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
