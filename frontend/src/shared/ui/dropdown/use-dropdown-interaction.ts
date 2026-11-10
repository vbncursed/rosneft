import { useRef, useState, type KeyboardEvent } from "react";
import { nextEnabled } from "@/shared/lib/roving";
import { useDismiss } from "@/shared/lib/use-dismiss";
import type { DropdownOption, DropdownProps } from "./dropdown";

const ARROW_DIRECTION = new Map<string, 1 | -1>([
  ["ArrowDown", 1],
  ["ArrowUp", -1],
]);

function reconcileOption<T extends string>(
  options: DropdownOption<T>[],
  cursor: { value: T | undefined; disabled: boolean },
) {
  const current = options.find((option) => option.value === cursor.value);
  if (!current || (current.disabled && !cursor.disabled)) return options.find((option) => !option.disabled);
  return current;
}

export function useDropdownInteraction<T extends string>({
  options,
  value,
  onChange,
}: Pick<DropdownProps<T>, "options" | "value" | "onChange">) {
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const [cursor, setCursor] = useState<{ value: T | undefined; disabled: boolean }>(() => ({
    value: options[selectedIndex]?.value,
    disabled: Boolean(options[selectedIndex]?.disabled),
  }));
  const current = reconcileOption(options, cursor);
  const nextCursor = { value: current?.value, disabled: Boolean(current?.disabled) };
  if (nextCursor.value !== cursor.value || nextCursor.disabled !== cursor.disabled) setCursor(nextCursor);
  const navigationIndex = current ? options.indexOf(current) : -1;
  const active = current && !current.disabled ? navigationIndex : -1;
  const setActive = (index: number) =>
    setCursor({ value: options[index]?.value, disabled: Boolean(options[index]?.disabled) });

  useDismiss(root, open, () => setOpen(false));

  const selected = options[selectedIndex];

  const choose = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    // Focus stays on the trigger (aria-activedescendant); a pointer on an
    // option, which is not focusable, would otherwise drop it to <body>.
    button.current?.focus();
    onChange(option.value);
    setOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const direction = ARROW_DIRECTION.get(event.key);
    const selectKey = event.key === "Enter" || event.key === " ";
    if (!open) {
      if (direction === 1 || selectKey) {
        event.preventDefault();
        setActive(selectedIndex);
        setOpen(true);
      }
      return;
    }
    if (direction) {
      event.preventDefault();
      setActive(nextEnabled(options.length, navigationIndex, direction, (n) => Boolean(options[n].disabled)));
    } else if (selectKey) {
      event.preventDefault();
      choose(active);
    }
  };

  const toggle = () => {
    setActive(selectedIndex);
    setOpen((wasOpen) => !wasOpen);
  };

  return { root, button, open, selected, active, setActive, choose, toggle, onKeyDown };
}
