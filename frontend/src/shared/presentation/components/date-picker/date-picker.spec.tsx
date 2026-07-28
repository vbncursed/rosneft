// Run with: yarn test:spa  (vitest + jsdom).
//
// cleanup is wired by hand: vitest runs without `globals`, so testing-library
// cannot register its own afterEach hook.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// motion мокается, чтобы панель монтировалась и размонтировалась синхронно:
// exit-анимация оставила бы закрытую панель в DOM и превратила любую проверку
// закрытия в гонку. Мок сторонней рендер-обёртки — принятый в проекте приём
// (panorama-loading-overlay.spec.tsx так мокает drei).
vi.mock("motion/react", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: {
    div: (props: Record<string, unknown>) => {
      // motion-специфичные пропсы отбрасываем, иначе React ругается на
      // неизвестные DOM-атрибуты. Ведущее подчёркивание — принятая в проекте
      // отметка намеренно неиспользуемой переменной (eslint.config.mjs:30-33).
      const {
        variants: _variants,
        initial: _initial,
        animate: _animate,
        exit: _exit,
        transition: _transition,
        ...rest
      } = props;
      return <div {...(rest as React.ComponentProps<"div">)} />;
    },
  },
  useReducedMotion: () => false,
}));

import DatePicker from "./date-picker";

// Ячейки ищем по data-iso, а не по подписи: подпись форматируется Intl в
// локали окружения, и завязка на неё сделала бы тест хрупким.
function day(iso: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-iso="${iso}"]`);
  if (!el) throw new Error(`no day cell rendered for ${iso}`);
  return el;
}

afterEach(cleanup);

describe("DatePicker", () => {
  it("shows the placeholder while no date is chosen", () => {
    render(<DatePicker value="" onChange={vi.fn()} ariaLabel="From" />);

    const trigger = screen.getByRole("button", { name: "From" });
    expect(trigger.textContent).toContain("any");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("reports the clicked day as an ISO date and closes", async () => {
    const onChange = vi.fn();
    render(<DatePicker value="2026-07-15" onChange={onChange} ariaLabel="From" />);

    await userEvent.click(screen.getByRole("button", { name: "From" }));
    await userEvent.click(day("2026-07-29"));

    expect(onChange).toHaveBeenCalledWith("2026-07-29");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders the adjacent months that pad the six-week grid", async () => {
    render(<DatePicker value="2026-07-15" onChange={vi.fn()} ariaLabel="From" />);

    await userEvent.click(screen.getByRole("button", { name: "From" }));

    // 1 июля 2026 — среда, поэтому сетка начинается 29 июня.
    expect(day("2026-06-29")).toBeTruthy();
    expect(document.querySelectorAll("[data-iso]").length).toBe(42);
  });

  it("refuses a day past max", async () => {
    const onChange = vi.fn();
    render(
      <DatePicker value="2026-07-15" onChange={onChange} max="2026-07-20" ariaLabel="To" />,
    );

    await userEvent.click(screen.getByRole("button", { name: "To" }));
    expect(day("2026-07-25").getAttribute("aria-disabled")).toBe("true");

    await userEvent.click(day("2026-07-25"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("refuses a day before min", async () => {
    const onChange = vi.fn();
    render(
      <DatePicker value="2026-07-15" onChange={onChange} min="2026-07-10" ariaLabel="To" />,
    );

    await userEvent.click(screen.getByRole("button", { name: "To" }));
    expect(day("2026-07-05").getAttribute("aria-disabled")).toBe("true");

    await userEvent.click(day("2026-07-05"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("clears the value from the panel footer", async () => {
    const onChange = vi.fn();
    render(<DatePicker value="2026-07-15" onChange={onChange} ariaLabel="From" />);

    await userEvent.click(screen.getByRole("button", { name: "From" }));
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(onChange).toHaveBeenCalledWith("");
  });

  it("walks the month with the previous/next buttons", async () => {
    render(<DatePicker value="2026-07-15" onChange={vi.fn()} ariaLabel="From" />);

    await userEvent.click(screen.getByRole("button", { name: "From" }));
    await userEvent.click(screen.getByRole("button", { name: "Previous month" }));

    expect(day("2026-06-15")).toBeTruthy();
    expect(document.querySelector('[data-iso="2026-07-31"]')).toBeNull();
  });

  it("moves the keyboard cursor one day at a time", async () => {
    render(<DatePicker value="2026-07-15" onChange={vi.fn()} ariaLabel="From" />);

    await userEvent.click(screen.getByRole("button", { name: "From" }));
    expect(day("2026-07-15").getAttribute("aria-current")).toBe("date");

    await userEvent.keyboard("{ArrowRight}");
    expect(day("2026-07-16").getAttribute("aria-current")).toBe("date");
    expect(day("2026-07-15").getAttribute("aria-current")).toBeNull();

    await userEvent.keyboard("{ArrowDown}");
    expect(day("2026-07-23").getAttribute("aria-current")).toBe("date");
  });

  it("commits the cursor on Enter", async () => {
    const onChange = vi.fn();
    render(<DatePicker value="2026-07-15" onChange={onChange} ariaLabel="From" />);

    await userEvent.click(screen.getByRole("button", { name: "From" }));
    await userEvent.keyboard("{ArrowRight}{Enter}");

    expect(onChange).toHaveBeenCalledWith("2026-07-16");
  });

  it("keeps the cursor put when the next day is out of range", async () => {
    render(
      <DatePicker value="2026-07-20" onChange={vi.fn()} max="2026-07-20" ariaLabel="To" />,
    );

    await userEvent.click(screen.getByRole("button", { name: "To" }));
    await userEvent.keyboard("{ArrowRight}");

    expect(day("2026-07-20").getAttribute("aria-current")).toBe("date");
  });

  it("closes on Escape", async () => {
    render(<DatePicker value="2026-07-15" onChange={vi.fn()} ariaLabel="From" />);

    await userEvent.click(screen.getByRole("button", { name: "From" }));
    expect(screen.getByRole("dialog")).toBeTruthy();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
