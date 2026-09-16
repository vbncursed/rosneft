import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearNotices, notify, useNotices } from "@/shared/lib/notify";
import { Toaster } from "./toaster";

beforeEach(() => clearNotices());
afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
});

const region = () => document.querySelector<HTMLElement>('[aria-live="polite"]');

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, value: hidden });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("Toaster", () => {
  // A live region only announces changes that happen after it exists.
  it("keeps an empty polite live region mounted before anything is reported", () => {
    render(<Toaster />);
    expect(region()).toBeInTheDocument();
    expect(region()).toBeEmptyDOMElement();
  });

  it("announces a confirmation through the region, not a nested status", () => {
    render(<Toaster />);
    act(() => {
      notify.success("Permissions saved");
    });
    expect(region()).toHaveTextContent("Permissions saved");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("slides a card in from above, and only fades under reduced motion", () => {
    render(<Toaster />);
    act(() => {
      notify.success("Saved");
    });
    const card = region()!.firstElementChild!;
    expect(card.className.split(/\s+/)).toEqual(
      expect.arrayContaining([
        "starting:opacity-0",
        "starting:-translate-y-2",
        "motion-reduce:starting:translate-y-0",
        "transition-[opacity,translate]",
        "duration-200",
        "ease-out",
      ]),
    );
  });

  it("holds a confirmation while the pointer is on it", () => {
    vi.useFakeTimers();
    render(<Toaster />);
    act(() => {
      notify.success("Saved");
    });

    fireEvent.mouseEnter(region()!.firstElementChild!);
    act(() => vi.advanceTimersByTime(10_000));
    expect(region()).toHaveTextContent("Saved");

    fireEvent.mouseLeave(region()!.firstElementChild!);
    act(() => vi.advanceTimersByTime(4000));
    expect(region()).toBeEmptyDOMElement();
  });

  it("holds a confirmation while the tab is hidden", () => {
    vi.useFakeTimers();
    render(<Toaster />);
    act(() => {
      notify.success("Saved");
    });

    act(() => setHidden(true));
    act(() => vi.advanceTimersByTime(10_000));
    expect(region()).toHaveTextContent("Saved");

    act(() => setHidden(false));
    act(() => vi.advanceTimersByTime(4000));
    expect(region()).toBeEmptyDOMElement();
  });

  // Dismissing the card under the pointer removes it without a mouseleave;
  // the hover hold must not outlive the last card.
  it("drops the hover hold once the last card is gone", async () => {
    render(<Toaster />);
    act(() => {
      notify.error("Failed");
    });
    fireEvent.mouseEnter(region()!.firstElementChild!);
    await userEvent.click(screen.getByRole("button", { name: "Dismiss: Failed" }));

    vi.useFakeTimers();
    act(() => {
      notify.success("Saved");
    });
    act(() => vi.advanceTimersByTime(4000));
    expect(region()).toBeEmptyDOMElement();
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

  // A tab opened in the background fires no visibilitychange until it is
  // shown, so the hold has to be read on mount.
  it("holds from the start when mounted in a hidden tab", () => {
    vi.useFakeTimers();
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    render(<Toaster />);
    act(() => {
      notify.success("Saved");
    });
    act(() => vi.advanceTimersByTime(10_000));
    expect(region()).toHaveTextContent("Saved");
  });

  // The holds live in the module; a shell unmounting mid-hover must not
  // leave the clocks stopped for whatever mounts next.
  it("drops its holds when it unmounts", () => {
    vi.useFakeTimers();
    const { unmount } = render(<Toaster />);
    act(() => {
      notify.success("Saved");
    });
    fireEvent.mouseEnter(region()!.firstElementChild!);
    act(() => setHidden(true));
    unmount();

    const { result } = renderHook(() => useNotices());
    act(() => vi.advanceTimersByTime(4000));
    expect(result.current).toEqual([]);
  });

  // The gap between two cards is page, not card: crossing it fired
  // mouseleave and let the clock run for a moment. A pseudo-element under
  // each card bridges it; Tailwind's --tw-content defaults to "", so every
  // after: utility draws one, and the last card's is hidden instead.
  it("bridges the gap between cards so hover survives the crossing", () => {
    render(<Toaster />);
    act(() => {
      notify.success("Saved");
    });
    expect(region()!.firstElementChild).toHaveClass(
      "relative",
      "after:absolute",
      "after:top-full",
      "after:h-2",
      "last:after:hidden",
    );
  });
});
