import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearNotices, notify } from "@/shared/lib/notify";
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

  it("draws each notice as a design-system toast that lets clicks through around it", () => {
    render(<Toaster />);
    act(() => {
      notify.success("Saved");
    });
    expect(region()).toHaveClass("pointer-events-none");
    expect(region()!.firstElementChild).toHaveClass("toast", "pointer-events-auto");
  });

  it("sits top-right by default", () => {
    render(<Toaster />);
    expect(region()!.className.split(/\s+/)).toEqual(expect.arrayContaining(["fixed", "right-4", "top-4"]));
  });

  // E11: in the viewer the top-right corner is the Overlays panel's head.
  it("sits bottom-centre when asked", () => {
    render(<Toaster placement="bottom-center" />);
    const cls = region()!.className.split(/\s+/);
    expect(cls).toEqual(expect.arrayContaining(["fixed", "bottom-16", "left-1/2", "-translate-x-1/2", "z-50"]));
    expect(cls).not.toContain("top-4");
  });

  it("shows three cards, newest on top, and folds the rest into +N more", () => {
    render(<Toaster />);
    act(() => {
      ["one", "two", "three", "four", "five"].forEach((m) => notify.error(m));
    });
    expect(screen.getAllByRole("alert").map((a) => a.querySelector("p")!.textContent)).toEqual([
      "five",
      "four",
      "three",
    ]);
    expect(region()).toHaveTextContent("+2 more");
  });

  it("lets a confirmation go after four seconds, and holds it under the pointer", () => {
    vi.useFakeTimers();
    render(<Toaster />);
    act(() => {
      notify.success("Saved");
    });
    fireEvent.pointerEnter(region()!.firstElementChild!);
    act(() => vi.advanceTimersByTime(10_000));
    expect(region()).toHaveTextContent("Saved");

    fireEvent.pointerLeave(region()!.firstElementChild!);
    act(() => vi.advanceTimersByTime(4150));
    expect(region()).toBeEmptyDOMElement();
  });

  // A card's countdown runs only while it is drawn; a hidden tab draws none.
  it("keeps a confirmation for the reader who comes back to the tab", () => {
    vi.useFakeTimers();
    render(<Toaster />);
    act(() => {
      notify.success("Saved");
    });
    act(() => setHidden(true));
    act(() => vi.advanceTimersByTime(10_000));
    act(() => setHidden(false));
    expect(region()).toHaveTextContent("Saved");
    act(() => vi.advanceTimersByTime(4150));
    expect(region()).toBeEmptyDOMElement();
  });

  // A tab opened in the background fires no visibilitychange until it is shown.
  it("holds from the start when mounted in a hidden tab", () => {
    vi.useFakeTimers();
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    render(<Toaster />);
    act(() => {
      notify.success("Saved");
    });
    act(() => vi.advanceTimersByTime(10_000));
    act(() => setHidden(false));
    expect(region()).toHaveTextContent("Saved");
  });

  it("shows a reported failure as an alert and lets the reader dismiss it", async () => {
    render(<Toaster />);
    act(() => {
      notify.error("Cannot freeze the last admin.");
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Cannot freeze the last admin.");
    await userEvent.click(screen.getByRole("button", { name: "Dismiss: Cannot freeze the last admin." }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("runs a notice's action once and takes the card away", async () => {
    const run = vi.fn();
    render(<Toaster />);
    act(() => {
      notify.error("Measurement not saved", { label: "Retry", run });
    });
    await userEvent.click(screen.getByRole("button", { name: "Retry: Measurement not saved" }));
    expect(run).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  // Review M6 m-5: the card goes away under the pointer; focus must not fall
  // to <body>, it goes back where the reader was before reaching the card.
  it.each([
    ["Retry: Not saved", { label: "Retry", run: () => {} }],
    ["Dismiss: Not saved", undefined],
  ])("hands focus back after %s takes the card away", async (name, action) => {
    render(
      <>
        <button type="button">Measure</button>
        <Toaster />
      </>,
    );
    screen.getByRole("button", { name: "Measure" }).focus();
    act(() => {
      notify.error("Not saved", action);
    });
    await userEvent.click(screen.getByRole("button", { name }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Measure" })).toHaveFocus());
  });

  // Review M6 m-8: the way back is used once. A later card closed by a click
  // that focuses nothing (Safari) must not pull focus to a field left long ago.
  it("does not send focus back a second time for a card closed with nothing focused", async () => {
    render(
      <>
        <button type="button">Measure</button>
        <Toaster />
      </>,
    );
    const measure = screen.getByRole("button", { name: "Measure" });
    measure.focus();
    act(() => {
      notify.error("First");
    });
    await userEvent.click(screen.getByRole("button", { name: "Dismiss: First" }));
    await waitFor(() => expect(measure).toHaveFocus());
    measure.blur();
    act(() => {
      notify.error("Second");
    });
    fireEvent.click(screen.getByRole("button", { name: "Dismiss: Second" }));
    await waitFor(() => expect(screen.queryByText("Second")).not.toBeInTheDocument());
    expect(document.body).toHaveFocus();
  });

  it("leaves a field the reader moved on to alone when a card closes", async () => {
    render(
      <>
        <button type="button">Measure</button>
        <input aria-label="Title" />
        <Toaster />
      </>,
    );
    screen.getByRole("button", { name: "Measure" }).focus();
    act(() => {
      notify.error("Not saved");
    });
    const title = screen.getByRole("textbox", { name: "Title" });
    // The dismiss button wears a Tooltip, whose onBlur sets state.
    act(() => {
      screen.getByRole("button", { name: "Dismiss: Not saved" }).focus();
      title.focus();
    });
    fireEvent.click(screen.getByRole("button", { name: "Dismiss: Not saved" }));
    await waitFor(() => expect(screen.queryByText("Not saved")).not.toBeInTheDocument());
    expect(title).toHaveFocus();
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
    expect(screen.getByRole("button", { name: "Dismiss: Cannot freeze the last admin." })).toBeInTheDocument();
  });
});
