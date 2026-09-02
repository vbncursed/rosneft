import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PersonInspector } from "./person-inspector";
import type { User } from "@/entities/user";

const user = (over: Partial<User> = {}): User => ({
  id: "u-2",
  username: "d.smirnov",
  email: "d.smirnov@example.com",
  status: "active",
  totpEnabled: false,
  passkeyEnabled: false,
  roleSlugs: ["field-operator"],
  roleTitles: { "field-operator": "field-operator" },
  isOwner: false,
  ...over,
});

const handlers = () => ({
  onClose: vi.fn(),
  onResetPassword: vi.fn(),
  onRequire2fa: vi.fn(),
  onFreeze: vi.fn(),
  onDelete: vi.fn(),
});

describe("PersonInspector", () => {
  it("is a region named after the person", () => {
    render(<PersonInspector user={user()} {...handlers()} />);
    expect(screen.getByRole("complementary", { name: "Person: d.smirnov" })).toBeInTheDocument();
    expect(screen.getByText("d.smirnov@example.com")).toBeInTheDocument();
  });

  it("shows the status in its own tone", () => {
    const { rerender } = render(<PersonInspector user={user()} {...handlers()} />);
    expect(screen.getByText("active").className).toContain("text-ok");

    rerender(<PersonInspector user={user({ status: "frozen" })} {...handlers()} />);
    expect(screen.getByText("frozen").className).toContain("text-warn");
  });

  it("shows the session count only when there is one", () => {
    const { rerender } = render(<PersonInspector user={user()} {...handlers()} />);
    expect(screen.queryByText("sessions")).not.toBeInTheDocument();

    rerender(<PersonInspector user={user()} sessions="2 devices" {...handlers()} />);
    expect(screen.getByText("2 devices")).toBeInTheDocument();
  });

  it("offers the four management actions", async () => {
    const h = handlers();
    render(<PersonInspector user={user()} {...h} />);

    for (const [name, fn] of [
      ["Reset password", h.onResetPassword],
      ["Require 2FA", h.onRequire2fa],
      ["Freeze", h.onFreeze],
      ["Delete", h.onDelete],
    ] as const) {
      await userEvent.click(screen.getByRole("button", { name }));
      expect(fn).toHaveBeenCalledOnce();
    }
  });

  it("offers to unfreeze an account that is already frozen", () => {
    render(<PersonInspector user={user({ status: "frozen" })} {...handlers()} />);
    expect(screen.getByRole("button", { name: "Unfreeze" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Freeze" })).not.toBeInTheDocument();
  });

  it("hides every action from a reader who may not manage people", () => {
    render(<PersonInspector user={user()} {...handlers()} canManage={false} />);
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    // Closing is not managing.
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("closes", async () => {
    const h = handlers();
    render(<PersonInspector user={user()} {...h} />);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(h.onClose).toHaveBeenCalledOnce();
  });

  it("hosts what the page puts between the header and the actions", () => {
    render(
      <PersonInspector user={user()} {...handlers()}>
        <p>role editor</p>
      </PersonInspector>,
    );
    expect(screen.getByText("role editor")).toBeInTheDocument();
  });
});
