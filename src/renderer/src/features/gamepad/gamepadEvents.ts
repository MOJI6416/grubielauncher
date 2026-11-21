import { useEffect, useRef } from "react";
import type { GamepadButton } from "./gamepadInput";

const GAMEPAD_EVENT = "grubie:gamepad";

export function emitGamepadPress(button: GamepadButton): boolean {
  const event = new CustomEvent<GamepadButton>(GAMEPAD_EVENT, {
    detail: button,
    cancelable: true,
  });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

export function useGamepadPress(
  handler: (button: GamepadButton) => boolean,
): void {
  const latest = useRef(handler);

  useEffect(() => {
    latest.current = handler;
  });

  useEffect(() => {
    const listener = (event: Event) => {
      const button = (event as CustomEvent<GamepadButton>).detail;
      if (latest.current(button)) event.preventDefault();
    };
    window.addEventListener(GAMEPAD_EVENT, listener);
    return () => window.removeEventListener(GAMEPAD_EVENT, listener);
  }, []);
}
