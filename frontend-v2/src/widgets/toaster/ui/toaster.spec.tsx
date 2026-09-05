import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { clearNotices, notify } from "@/shared/lib/notify";
import { Toaster } from "./toaster";

beforeEach(() => clearNotices());

describe("Toaster", () => {
  it("renders nothing until something is reported", () => {
    const { container } = render(<Toaster />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a reported failure as an alert and lets the reader dismiss it", async () => {
    render(<Toaster />);
    act(() => {
      notify.error("Cannot freeze the last admin.");
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Cannot freeze the last admin.");
    await userEvent.click(
      screen.getByRole("button", { name: "Dismiss: Cannot freeze the last admin." }),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // Two notices at once must not give a screen reader two identically named
  // "Dismiss" buttons.
  it("gives each stacked notice a uniquely named dismiss button", () => {
    render(<Toaster />);
    act(() => {
      notify.success("Saved");
      notify.error("Cannot freeze the last admin.");
    });

    expect(screen.getByRole("button", { name: "Dismiss: Saved" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Dismiss: Cannot freeze the last admin." }),
    ).toBeInTheDocument();
  });
});
