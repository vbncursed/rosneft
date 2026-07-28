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

// Ячейки ищем по data-iso, а не по подписи: подпись форматируется Intl в локали
// окружения, и завязка на неё сделала бы тест хрупким.
function day(iso: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-iso="${iso}"]`);
  if (!el) throw new Error(`no day cell rendered for ${iso}`);
  return el;
}

const field = (name = "From") => screen.getByRole("textbox", { name });
const calendarButton = (name = "From") =>
  screen.getByRole("button", { name: `${name}: open the calendar` });

afterEach(cleanup);

describe("DatePicker text entry", () => {
  it("shows the current value in the field, ready to be typed over", () => {
    render(<DatePicker value="2026-07-15" onChange={vi.fn()} ariaLabel="From" />);

    expect((field() as HTMLInputElement).value).toBe("15/07/2026");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the format as a placeholder when empty", () => {
    render(<DatePicker value="" onChange={vi.fn()} ariaLabel="From" />);

    expect(field().getAttribute("placeholder")).toBe("dd/mm/yyyy");
  });

  it("accepts a typed date on Enter", async () => {
    const onChange = vi.fn();
    render(<DatePicker value="" onChange={onChange} ariaLabel="From" />);

    await userEvent.type(field(), "29/07/2026{Enter}");

    expect(onChange).toHaveBeenCalledWith("2026-07-29");
  });

  it("accepts a typed date on blur", async () => {
    const onChange = vi.fn();
    render(<DatePicker value="" onChange={onChange} ariaLabel="From" />);

    await userEvent.type(field(), "29.07.2026");
    await userEvent.tab();

    expect(onChange).toHaveBeenCalledWith("2026-07-29");
  });

  it("accepts an ISO date pasted from elsewhere", async () => {
    const onChange = vi.fn();
    render(<DatePicker value="" onChange={onChange} ariaLabel="From" />);

    await userEvent.type(field(), "2026-07-29{Enter}");

    expect(onChange).toHaveBeenCalledWith("2026-07-29");
  });

  it("marks an unreadable entry invalid and reverts it", async () => {
    const onChange = vi.fn();
    render(<DatePicker value="2026-07-15" onChange={onChange} ariaLabel="From" />);

    await userEvent.clear(field());
    await userEvent.type(field(), "31/02/2026");
    expect(field().getAttribute("aria-invalid")).toBe("true");

    await userEvent.tab();

    expect(onChange).not.toHaveBeenCalled();
    expect((field() as HTMLInputElement).value).toBe("15/07/2026");
  });

  it("treats a date outside the bounds as invalid too", async () => {
    const onChange = vi.fn();
    render(
      <DatePicker value="2026-07-15" onChange={onChange} max="2026-07-20" ariaLabel="From" />,
    );

    await userEvent.clear(field());
    await userEvent.type(field(), "25/07/2026");
    // Разбирается успешно, но принята не будет — краснеть поле должно до откатa.
    expect(field().getAttribute("aria-invalid")).toBe("true");

    await userEvent.tab();

    expect(onChange).not.toHaveBeenCalled();
    expect((field() as HTMLInputElement).value).toBe("15/07/2026");
  });

  it("clearing the field clears the filter", async () => {
    const onChange = vi.fn();
    render(<DatePicker value="2026-07-15" onChange={onChange} ariaLabel="From" />);

    await userEvent.clear(field());
    await userEvent.tab();

    expect(onChange).toHaveBeenCalledWith("");
  });
});

describe("DatePicker calendar", () => {
  it("opens from the button and moves focus onto the current day", async () => {
    render(<DatePicker value="2026-07-15" onChange={vi.fn()} ariaLabel="From" />);

    await userEvent.click(calendarButton());

    expect(screen.getByRole("dialog")).toBeTruthy();
    // Фокус обязан уехать в панель: иначе стрелки достались бы каретке поля.
    expect(document.activeElement).toBe(day("2026-07-15"));
  });

  it("opens on ArrowDown from the field", async () => {
    render(<DatePicker value="2026-07-15" onChange={vi.fn()} ariaLabel="From" />);

    field().focus();
    await userEvent.keyboard("{ArrowDown}");

    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("reports the clicked day as an ISO date and closes", async () => {
    const onChange = vi.fn();
    render(<DatePicker value="2026-07-15" onChange={onChange} ariaLabel="From" />);

    await userEvent.click(calendarButton());
    await userEvent.click(day("2026-07-29"));

    expect(onChange).toHaveBeenCalledWith("2026-07-29");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders the adjacent months that pad the six-week grid", async () => {
    render(<DatePicker value="2026-07-15" onChange={vi.fn()} ariaLabel="From" />);

    await userEvent.click(calendarButton());

    // 1 июля 2026 — среда, поэтому сетка начинается 29 июня.
    expect(day("2026-06-29")).toBeTruthy();
    expect(document.querySelectorAll("[data-iso]").length).toBe(42);
  });

  it("refuses a day past max", async () => {
    const onChange = vi.fn();
    render(
      <DatePicker value="2026-07-15" onChange={onChange} max="2026-07-20" ariaLabel="To" />,
    );

    await userEvent.click(calendarButton("To"));
    expect(day("2026-07-25").getAttribute("aria-disabled")).toBe("true");

    await userEvent.click(day("2026-07-25"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("refuses a day before min", async () => {
    const onChange = vi.fn();
    render(
      <DatePicker value="2026-07-15" onChange={onChange} min="2026-07-10" ariaLabel="To" />,
    );

    await userEvent.click(calendarButton("To"));
    expect(day("2026-07-05").getAttribute("aria-disabled")).toBe("true");

    await userEvent.click(day("2026-07-05"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("clears the value from the panel footer", async () => {
    const onChange = vi.fn();
    render(<DatePicker value="2026-07-15" onChange={onChange} ariaLabel="From" />);

    await userEvent.click(calendarButton());
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(onChange).toHaveBeenCalledWith("");
  });

  it("the month arrows carry the cursor with them, so focus never drops", async () => {
    render(<DatePicker value="2026-07-15" onChange={vi.fn()} ariaLabel="From" />);

    await userEvent.click(calendarButton());
    await userEvent.click(screen.getByRole("button", { name: "Previous month" }));

    expect(day("2026-06-15")).toBeTruthy();
    expect(document.querySelector('[data-iso="2026-07-31"]')).toBeNull();
    // Курсор переехал на 1 июня и удержал фокус — без этого следующая стрелка
    // ушла бы в никуда.
    expect(document.activeElement).toBe(day("2026-06-01"));
  });

  it("moves the cursor one day and one week at a time", async () => {
    render(<DatePicker value="2026-07-15" onChange={vi.fn()} ariaLabel="From" />);

    await userEvent.click(calendarButton());
    await userEvent.keyboard("{ArrowRight}");
    expect(day("2026-07-16").getAttribute("aria-current")).toBe("date");
    expect(day("2026-07-15").getAttribute("aria-current")).toBeNull();

    await userEvent.keyboard("{ArrowDown}");
    expect(day("2026-07-23").getAttribute("aria-current")).toBe("date");
  });

  it("commits the cursor on Enter", async () => {
    const onChange = vi.fn();
    render(<DatePicker value="2026-07-15" onChange={onChange} ariaLabel="From" />);

    await userEvent.click(calendarButton());
    await userEvent.keyboard("{ArrowRight}{Enter}");

    expect(onChange).toHaveBeenCalledWith("2026-07-16");
  });

  it("keeps the cursor put when the next day is out of range", async () => {
    render(
      <DatePicker value="2026-07-20" onChange={vi.fn()} max="2026-07-20" ariaLabel="To" />,
    );

    await userEvent.click(calendarButton("To"));
    await userEvent.keyboard("{ArrowRight}");

    expect(day("2026-07-20").getAttribute("aria-current")).toBe("date");
  });

  it("closes on Escape and hands focus back to the field", async () => {
    render(<DatePicker value="2026-07-15" onChange={vi.fn()} ariaLabel="From" />);

    await userEvent.click(calendarButton());
    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(field());
  });
});
