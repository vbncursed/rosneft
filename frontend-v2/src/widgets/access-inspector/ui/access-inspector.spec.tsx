import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AccessInspector, type AccessInspectorProps } from "./access-inspector";
import type { AccessGrant, TerritoryAccess } from "@/entities/territory";

const territory: TerritoryAccess = {
  slug: "refinery-block-c",
  title: "Refinery Block C",
  visibility: "assigned",
  meta: "refinery-block-c · 14 placements",
  faces: ["a.ivanova"],
  peopleLabel: "4 people",
};

const grant = (over: Partial<AccessGrant> = {}): AccessGrant => ({
  userId: "u-3",
  username: "k.petrov",
  roleTitle: "Field Operator",
  via: "direct",
  ...over,
});

const props = (over: Partial<AccessInspectorProps> = {}): AccessInspectorProps => ({
  territory,
  visibility: "assigned",
  onVisibilityChange: vi.fn(),
  grants: [grant({ userId: "u-1", username: "a.ivanova", via: "owner" }), grant()],
  onAddPerson: vi.fn(),
  onRemoveGrant: vi.fn(),
  onClose: vi.fn(),
  onCancel: vi.fn(),
  onSave: vi.fn(),
  ...over,
});

describe("AccessInspector", () => {
  it("is a region named after the territory", () => {
    render(<AccessInspector {...props()} />);
    expect(
      screen.getByRole("complementary", { name: "Access: Refinery Block C" }),
    ).toBeInTheDocument();
    expect(screen.getByText("refinery-block-c")).toBeInTheDocument();
  });

  it("offers the three visibilities, with the current one chosen", () => {
    render(<AccessInspector {...props()} />);
    expect(screen.getByRole("radio", { name: /Assigned people/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Whole company/ })).not.toBeChecked();
  });

  it("changes visibility", async () => {
    const onVisibilityChange = vi.fn();
    render(<AccessInspector {...props({ onVisibilityChange })} />);
    await userEvent.click(screen.getByRole("radio", { name: /Owner only/ }));
    expect(onVisibilityChange).toHaveBeenCalledWith("private");
  });

  it("lists who has access, and counts them", () => {
    render(<AccessInspector {...props()} />);
    expect(screen.getByText("With access · 2")).toBeInTheDocument();
    expect(screen.getByText("k.petrov")).toBeInTheDocument();
  });

  it("hides the people list when access is not granted per person", () => {
    const { rerender } = render(<AccessInspector {...props()} />);
    expect(screen.getByText(/With access/)).toBeInTheDocument();

    rerender(<AccessInspector {...props({ visibility: "company" })} />);
    expect(screen.queryByText(/With access/)).not.toBeInTheDocument();

    rerender(<AccessInspector {...props({ visibility: "private" })} />);
    expect(screen.queryByText(/With access/)).not.toBeInTheDocument();
  });

  it("removes a direct grant", async () => {
    const onRemoveGrant = vi.fn();
    render(<AccessInspector {...props({ onRemoveGrant })} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove k.petrov's access" }));
    expect(onRemoveGrant).toHaveBeenCalledWith("u-3");
  });

  it("explains inherited grants only when some are inherited", () => {
    const { rerender } = render(<AccessInspector {...props()} />);
    expect(screen.queryByText(/Role-granted access/)).not.toBeInTheDocument();

    rerender(<AccessInspector {...props({ grants: [grant({ via: "role" })] })} />);
    expect(screen.getByText(/Role-granted access can't be revoked here/)).toBeInTheDocument();
  });

  it("says so when nobody has access yet", () => {
    render(<AccessInspector {...props({ grants: [] })} />);
    expect(screen.getByText("Nobody can open this territory yet.")).toBeInTheDocument();
  });

  it("adds a person", async () => {
    const onAddPerson = vi.fn();
    render(<AccessInspector {...props({ onAddPerson })} />);
    await userEvent.click(screen.getByRole("button", { name: "+ add person" }));
    expect(onAddPerson).toHaveBeenCalledOnce();
  });

  it("saves only once something changed", async () => {
    const onSave = vi.fn();
    const { rerender } = render(<AccessInspector {...props({ onSave })} />);
    expect(screen.getByRole("button", { name: "Save access" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    rerender(<AccessInspector {...props({ onSave, dirty: true })} />);
    await userEvent.click(screen.getByRole("button", { name: "Save access" }));
    expect(onSave).toHaveBeenCalledOnce();
  });

  it("blocks a second save while one is in flight", async () => {
    const onSave = vi.fn();
    render(<AccessInspector {...props({ onSave, dirty: true, saving: true })} />);
    const button = screen.getByRole("button", { name: /Save access/ });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("shows the visibility as a sentence and always lists people when it cannot be changed", () => {
    render(<AccessInspector {...props({ visibility: "private", onVisibilityChange: undefined, grants: [] })} />);
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(screen.getByText("Owner only")).toBeInTheDocument();
    expect(screen.getByText("Nobody can open this territory yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ add person" })).toBeInTheDocument();
  });

  it("closes", async () => {
    const onClose = vi.fn();
    render(<AccessInspector {...props({ onClose })} />);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
