import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { ReactElement } from "react";
import { Toast, ToastStack, waitsForReader } from "./toast";
import { Icon } from "@/shared/ui/icon";
import { hoverTip } from "@/shared/ui/tooltip/testing";

const card = (text: string) => screen.getByText(text).closest(".toast")!;
const glyphOf = (ui: ReactElement) => render(ui).container.querySelector("svg")!.innerHTML;

describe("Toast", () => {
  // A calm tone carries no role of its own: the host's polite live region
  // announces it, and a status inside that region would nest one in another.
  it("interrupts for an error and leaves info to the host's live region", () => {
    const { rerender } = render(<Toast tone="error">Conversion failed</Toast>);
    expect(screen.getByRole("alert")).toHaveTextContent("Conversion failed");

    rerender(<Toast tone="info">mesh-worker is processing</Toast>);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("labels itself from the tone", () => {
    render(<Toast tone="success">Passkey added.</Toast>);
    expect(screen.getByText("Success")).toBeInTheDocument();
  });

  it("takes an explicit label over the tone default", () => {
    render(
      <Toast tone="warning" label="Heads up">
        2FA status unavailable
      </Toast>,
    );
    expect(screen.getByText("Heads up")).toBeInTheDocument();
    expect(screen.queryByText("Warning")).not.toBeInTheDocument();
  });

  it("shows a dismiss control only when it can act", async () => {
    const onDismiss = vi.fn();
    const { rerender } = render(<Toast tone="info">Sticky</Toast>);
    expect(screen.queryByRole("button", { name: "Dismiss" })).not.toBeInTheDocument();

    rerender(
      <Toast tone="info" onDismiss={onDismiss}>
        Sticky
      </Toast>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(onDismiss).toHaveBeenCalledOnce());
  });

  it("draws its action as a named button that runs it", async () => {
    const onClick = vi.fn();
    render(
      <Toast tone="error" action={{ label: "Retry", name: "Retry: Not saved", onClick }}>
        Not saved
      </Toast>,
    );
    const button = screen.getByRole("button", { name: "Retry: Not saved" });
    expect(button).toHaveTextContent("Retry");
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  // Two stacked toasts must not both name their button "Dismiss" — a screen
  // reader cannot tell them apart.
  it("takes an explicit label for its dismiss button", () => {
    render(
      <Toast tone="info" onDismiss={() => {}} dismissLabel="Dismiss: Saved">
        Saved
      </Toast>,
    );
    expect(screen.getByRole("button", { name: "Dismiss: Saved" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dismiss" })).not.toBeInTheDocument();
  });

  // The glyph alone was a 10×24 target; WCAG 2.5.8 asks for 24×24.
  it("gives its dismiss glyph a 24px target that presses", () => {
    render(
      <Toast tone="info" onDismiss={vi.fn()}>
        Saved.
      </Toast>,
    );
    const cls = screen.getByRole("button", { name: "Dismiss" }).className.split(/\s+/);
    expect(cls).toEqual(
      expect.arrayContaining([
        "flex",
        "size-6",
        "items-center",
        "justify-center",
        "active:scale-95",
        "transition-[color,scale]",
        "ease-out",
      ]),
    );
    expect(cls).not.toContain("p-0");
  });
});

describe("Toast · dismiss mark", () => {
  it("draws its dismiss button as an icon, not a × character", () => {
    render(
      <Toast tone="info" onDismiss={vi.fn()}>
        Saved.
      </Toast>,
    );
    const dismiss = screen.getByRole("button", { name: "Dismiss" });
    expect(dismiss.querySelector("svg")).not.toBeNull();
    expect(dismiss.textContent).toBe("");
  });
});

describe("Toast · tooltip", () => {
  // The long accessible name tells stacked cards apart for a screen reader; a
  // sighted reader has the card itself, and a tooltip repeating it covers it.
  it("names its dismiss button plainly in a tooltip, whatever its accessible name", () => {
    render(
      <Toast tone="info" onDismiss={vi.fn()} dismissLabel="Dismiss: Saved">
        Saved
      </Toast>,
    );
    const tip = hoverTip(screen.getByRole("button", { name: "Dismiss: Saved" }));
    expect(tip?.textContent).toBe("Dismiss");
  });
});

// The card is opaque so the viewer's chrome never reads through it, and
// untinted: the tone shows in the border, overline, icon and countdown bar.
describe("Toast · ground", () => {
  it.each([
    ["error", "border-bad"],
    ["warning", "border-warn"],
    ["info", "border-accent-line"],
    ["success", "border-ok"],
  ] as const)("draws %s on the bare opaque panel with a %s border", (tone, border) => {
    render(<Toast tone={tone}>Saved.</Toast>);
    const cls = screen.getByText("Saved.").closest(".toast")!.className.split(/\s+/);
    expect(cls).toEqual(expect.arrayContaining(["bg-panel", border]));
    expect(cls.filter((c) => c.startsWith("bg-[image:") || c.endsWith("-soft"))).toEqual([]);
  });

  it("draws neutral on the bare panel", () => {
    render(<Toast tone="neutral">3 placements moved.</Toast>);
    const cls = card("3 placements moved.").className.split(/\s+/);
    expect(cls).toEqual(expect.arrayContaining(["bg-panel", "border-line-2"]));
    expect(cls.filter((c) => c.startsWith("bg-[image:"))).toHaveLength(0);
  });
});

describe("Toast · tones", () => {
  it.each([
    ["error", "close"],
    ["warning", "warning"],
    ["info", "info"],
    ["success", "check"],
  ] as const)("marks %s with the %s glyph", (tone, name) => {
    expect(glyphOf(<Toast tone={tone}>x</Toast>)).toBe(glyphOf(<Icon name={name} />));
  });

  it("states a plain fact as an untinted Notice", () => {
    render(<Toast tone="neutral">3 placements moved.</Toast>);
    expect(screen.getByText("Notice")).toBeInTheDocument();
    expect(card("3 placements moved.").className).toContain("border-line-2");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows work under way as busy, with a determinate bar when given progress", () => {
    render(
      <Toast tone="loading" progress={62.4}>
        Converting
      </Toast>,
    );
    expect(screen.getByText("Working")).toBeInTheDocument();
    expect(card("Converting")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "62");
  });

  it("draws no progress bar for loading without progress", () => {
    render(<Toast tone="loading">Waiting</Toast>);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });
});

describe("Toast · lifetime", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it.each(["success", "info", "neutral"] as const)("lets %s go after 4 s and its 150 ms exit", (tone) => {
    const onDismiss = vi.fn();
    render(
      <Toast tone={tone} onDismiss={onDismiss}>
        Saved.
      </Toast>,
    );
    act(() => vi.advanceTimersByTime(3999));
    expect(card("Saved.")).not.toHaveAttribute("data-leaving");
    act(() => vi.advanceTimersByTime(1));
    expect(card("Saved.")).toHaveAttribute("data-leaving");
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(150));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it.each(["error", "warning", "loading"] as const)("keeps %s until the reader acts", (tone) => {
    const onDismiss = vi.fn();
    render(
      <Toast tone={tone} onDismiss={onDismiss}>
        Stays.
      </Toast>,
    );
    act(() => vi.advanceTimersByTime(60_000));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("takes duration over the tone's, and null keeps any card", () => {
    const quick = vi.fn();
    const kept = vi.fn();
    render(
      <>
        <Toast tone="error" onDismiss={quick} duration={1000}>
          Quick
        </Toast>
        <Toast tone="success" onDismiss={kept} duration={null}>
          Kept
        </Toast>
      </>,
    );
    act(() => vi.advanceTimersByTime(1150));
    expect(quick).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(60_000));
    expect(kept).not.toHaveBeenCalled();
  });

  it("stops the countdown under the pointer and resumes with what was left", () => {
    const onDismiss = vi.fn();
    render(
      <Toast tone="success" onDismiss={onDismiss}>
        Saved.
      </Toast>,
    );
    act(() => vi.advanceTimersByTime(3000));
    fireEvent.pointerEnter(card("Saved."));
    act(() => vi.advanceTimersByTime(10_000));
    expect(card("Saved.")).not.toHaveAttribute("data-leaving");

    fireEvent.pointerLeave(card("Saved."));
    act(() => vi.advanceTimersByTime(999));
    expect(card("Saved.")).not.toHaveAttribute("data-leaving");
    act(() => vi.advanceTimersByTime(151));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("stops the countdown while focus is on the card", () => {
    const onDismiss = vi.fn();
    render(
      <Toast tone="success" onDismiss={onDismiss}>
        Saved.
      </Toast>,
    );
    act(() => screen.getByRole("button", { name: "Dismiss" }).focus());
    act(() => vi.advanceTimersByTime(10_000));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  const timed = (onDismiss = vi.fn()) => {
    render(
      <Toast tone="success" onDismiss={onDismiss}>
        Saved.
      </Toast>,
    );
    return { onDismiss, dismiss: screen.getByRole("button", { name: "Dismiss" }) };
  };

  it("keeps holding when the pointer leaves while focus is still in the card", () => {
    const { onDismiss, dismiss } = timed();
    act(() => dismiss.focus());
    fireEvent.pointerEnter(card("Saved."));
    fireEvent.pointerLeave(card("Saved."));
    act(() => vi.advanceTimersByTime(10_000));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("keeps holding when focus leaves while the pointer is still on the card", () => {
    const { onDismiss, dismiss } = timed();
    fireEvent.pointerEnter(card("Saved."));
    act(() => dismiss.focus());
    act(() => dismiss.blur());
    act(() => vi.advanceTimersByTime(10_000));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("does not restart the clock when focus moves between the card's own buttons", () => {
    const onDismiss = vi.fn();
    render(
      <Toast tone="success" onDismiss={onDismiss} action={{ label: "Undo", onClick: vi.fn() }}>
        Saved.
      </Toast>,
    );
    act(() => vi.advanceTimersByTime(3000));
    act(() => screen.getByRole("button", { name: "Undo" }).focus());
    act(() => screen.getByRole("button", { name: "Dismiss" }).focus());
    act(() => vi.advanceTimersByTime(10_000));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("resumes once both are gone", () => {
    const { onDismiss, dismiss } = timed();
    act(() => vi.advanceTimersByTime(3000));
    act(() => dismiss.focus());
    fireEvent.pointerEnter(card("Saved."));
    act(() => vi.advanceTimersByTime(10_000));
    fireEvent.pointerLeave(card("Saved."));
    act(() => dismiss.blur());
    act(() => vi.advanceTimersByTime(999));
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(151));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("calls the latest onDismiss, not the one the countdown started with", () => {
    const first = vi.fn();
    const second = vi.fn();
    const ui = (onDismiss: () => void) => (
      <Toast tone="success" onDismiss={onDismiss}>
        Saved.
      </Toast>
    );
    const { rerender } = render(ui(first));
    act(() => vi.advanceTimersByTime(2000));
    rerender(ui(second));
    act(() => vi.advanceTimersByTime(2000 + 150));
    expect(second).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
  });
});

describe("waitsForReader", () => {
  it.each(["error", "warning", "loading"] as const)("is true for %s", (tone) => {
    expect(waitsForReader(tone)).toBe(true);
  });
  it.each(["success", "info", "neutral"] as const)("is false for %s", (tone) => {
    expect(waitsForReader(tone)).toBe(false);
  });
});

describe("ToastStack", () => {
  const errors = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: i + 1, tone: "error" as const, children: `Notice ${i + 1}` }));
  const drawn = () => screen.getAllByText(/^Notice \d$/).map((p) => p.textContent);

  it("draws the newest on top, at most three, and counts the rest", () => {
    render(<ToastStack toasts={errors(5)} onDismiss={vi.fn()} />);
    expect(drawn()).toEqual(["Notice 5", "Notice 4", "Notice 3"]);
    expect(screen.getByText("+2 more")).toBeInTheDocument();
  });

  it("takes another max", () => {
    render(<ToastStack toasts={errors(2)} max={1} onDismiss={vi.fn()} />);
    expect(drawn()).toEqual(["Notice 2"]);
    expect(screen.getByText("+1 more")).toBeInTheDocument();
  });

  it("has no overflow line when every card fits", () => {
    render(<ToastStack toasts={errors(3)} onDismiss={vi.fn()} />);
    expect(screen.queryByText(/more$/)).not.toBeInTheDocument();
  });

  it("pins itself top-right as a polite region, unless inline", () => {
    const { rerender } = render(<ToastStack toasts={[]} onDismiss={vi.fn()} />);
    const region = screen.getByRole("region", { name: "Notifications" });
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region.className.split(/\s+/)).toEqual(expect.arrayContaining(["fixed", "top-4", "right-4"]));
    rerender(<ToastStack toasts={[]} onDismiss={vi.fn()} position="inline" />);
    expect(region).not.toHaveClass("fixed");
  });

  it("hands back the id of the card dismissed", async () => {
    const onDismiss = vi.fn();
    render(
      <ToastStack
        toasts={errors(2).map((t) => ({ ...t, dismissLabel: `Dismiss: ${t.children}` }))}
        onDismiss={onDismiss}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Dismiss: Notice 1" }));
    await waitFor(() => expect(onDismiss).toHaveBeenCalledExactlyOnceWith(1));
  });
});
