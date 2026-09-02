import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GrantRow } from "./grant-row";
import type { AccessGrant } from "@/entities/territory";

const grant = (over: Partial<AccessGrant> = {}): AccessGrant => ({
  userId: "u-3",
  username: "k.petrov",
  roleTitle: "Field Operator",
  via: "direct",
  ...over,
});

describe("GrantRow", () => {
  it("names the person and their role", () => {
    render(<GrantRow grant={grant()} />);
    expect(screen.getByText("k.petrov")).toBeInTheDocument();
    expect(screen.getByText("Field Operator")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "k.petrov" })).toBeInTheDocument();
  });

  it("says how the access was come by", () => {
    const { rerender } = render(<GrantRow grant={grant()} />);
    expect(screen.getByText("direct").className).toContain("text-accent");

    rerender(<GrantRow grant={grant({ via: "role" })} />);
    expect(screen.getByText("via role")).toBeInTheDocument();

    rerender(<GrantRow grant={grant({ via: "owner" })} />);
    expect(screen.getByText("owner")).toBeInTheDocument();
  });

  it("removes a direct grant", async () => {
    const onRemove = vi.fn();
    render(<GrantRow grant={grant()} onRemove={onRemove} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove k.petrov's access" }));
    expect(onRemove).toHaveBeenCalledWith("u-3");
  });

  it("cannot remove a role-granted one, and says why in its name", async () => {
    const onRemove = vi.fn();
    render(<GrantRow grant={grant({ via: "role" })} onRemove={onRemove} />);

    const button = screen.getByRole("button", {
      name: "k.petrov's access cannot be removed here",
    });
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("locked");
    await userEvent.click(button);
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("pins the owner rather than offering to remove them", () => {
    render(<GrantRow grant={grant({ via: "owner", username: "a.ivanova" })} />);
    expect(screen.getByRole("button")).toBeDisabled();
    expect(screen.getByRole("button")).toHaveTextContent("pinned");
  });

  it("tints the owner's row", () => {
    const { container, rerender } = render(<GrantRow grant={grant()} />);
    expect(container.firstElementChild!.className).toContain("bg-panel-2");

    rerender(<GrantRow grant={grant({ via: "owner" })} />);
    expect(container.firstElementChild!.className).toContain("bg-accent-soft");
  });

  it("dims a frozen or deleted account, without hiding their grant", () => {
    const { container } = render(<GrantRow grant={grant({ inactive: true })} />);
    expect(container.firstElementChild!.className).toContain("opacity-60");
    expect(screen.getByText("k.petrov")).toBeInTheDocument();
  });
});
