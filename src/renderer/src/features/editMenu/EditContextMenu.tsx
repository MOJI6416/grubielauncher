import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  ClipboardPaste,
  Copy,
  Link2,
  Scissors,
  TextSelect,
} from "lucide-react";
import {
  EditCommand,
  EditMenuItem,
  buildEditMenu,
  describeEditTarget,
} from "./editTarget";

const MENU_MARGIN = 8;

const COMMAND_ICONS: Record<EditCommand, typeof Copy> = {
  cut: Scissors,
  copy: Copy,
  paste: ClipboardPaste,
  selectAll: TextSelect,
};

const COMMAND_KEYS: Record<EditCommand, string> = {
  cut: "X",
  copy: "C",
  paste: "V",
  selectAll: "A",
};

const MODIFIER = /Mac/i.test(navigator.userAgent) ? "⌘" : "Ctrl+";

interface OpenMenu {
  x: number;
  y: number;
  items: EditMenuItem[];
}

function isActionable(item: EditMenuItem): boolean {
  return item.kind === "copyLink" || (item.kind === "command" && item.enabled);
}

export function EditContextMenu() {
  const { t } = useTranslation();
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const [active, setActive] = useState(-1);
  const [position, setPosition] = useState<{ left: number; top: number }>({
    left: 0,
    top: 0,
  });
  const menuRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => {
    setMenu(null);
    setActive(-1);
  }, []);

  const run = useCallback(
    (item: EditMenuItem) => {
      if (!isActionable(item)) return;
      close();

      if (item.kind === "copyLink") {
        void window.api.clipboard.writeText(item.url);
        return;
      }
      if (item.kind === "command") void window.api.edit.run(item.command);
    },
    [close],
  );

  useEffect(() => {
    const onContextMenu = (event: MouseEvent) => {
      if (event.defaultPrevented) return;

      const items = buildEditMenu(
        describeEditTarget(event.target, window.getSelection()?.toString() ?? ""),
      );
      if (items.length === 0) {
        close();
        return;
      }

      event.preventDefault();
      setActive(-1);
      setMenu({ x: event.clientX, y: event.clientY, items });
    };

    document.addEventListener("contextmenu", onContextMenu);
    return () => document.removeEventListener("contextmenu", onContextMenu);
  }, [close]);

  useLayoutEffect(() => {
    if (!menu || !menuRef.current) return;

    const { offsetWidth, offsetHeight } = menuRef.current;
    setPosition({
      left: Math.max(
        MENU_MARGIN,
        Math.min(menu.x, window.innerWidth - offsetWidth - MENU_MARGIN),
      ),
      top: Math.max(
        MENU_MARGIN,
        Math.min(menu.y, window.innerHeight - offsetHeight - MENU_MARGIN),
      ),
    });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;

    const actionable = menu.items
      .map((item, index) => (isActionable(item) ? index : -1))
      .filter((index) => index !== -1);

    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      close();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (actionable.length === 0) return;
        const current = actionable.indexOf(active);
        const step = event.key === "ArrowDown" ? 1 : -1;
        const next =
          current === -1
            ? step === 1
              ? 0
              : actionable.length - 1
            : (current + step + actionable.length) % actionable.length;
        setActive(actionable[next]);
        return;
      }

      if (event.key === "Enter" && active !== -1) {
        event.preventDefault();
        run(menu.items[active]);
        return;
      }

      close();
    };

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);

    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [active, close, menu, run]);

  if (!menu) return null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={t("editMenu.label")}
      style={{ left: position.left, top: position.top }}
      className="fixed z-[100] min-w-48 rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-xl animate-in fade-in-0 zoom-in-95"
      onContextMenu={(event) => event.preventDefault()}
    >
      {menu.items.map((item, index) => {
        if (item.kind === "separator") {
          return (
            <div key={`separator-${index}`} className="-mx-1 my-1 h-px bg-border" />
          );
        }

        const Icon = item.kind === "copyLink" ? Link2 : COMMAND_ICONS[item.command];
        const enabled = isActionable(item);
        const label =
          item.kind === "copyLink"
            ? t("editMenu.copyLink")
            : t(`editMenu.${item.command}`);

        return (
          <button
            key={item.kind === "command" ? item.command : "copyLink"}
            type="button"
            role="menuitem"
            disabled={!enabled}
            data-highlighted={index === active || undefined}
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => setActive(enabled ? index : -1)}
            onClick={() => run(item)}
            className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-sm outline-hidden select-none disabled:pointer-events-none disabled:opacity-40 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
          >
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {item.kind === "command" && (
              <span className="shrink-0 pl-4 font-mono text-[0.6875rem] text-faint">
                {MODIFIER}
                {COMMAND_KEYS[item.command]}
              </span>
            )}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
