import type { Direction } from "./spatial";

export type GamepadButton =
  | "a"
  | "b"
  | "x"
  | "y"
  | "lb"
  | "rb"
  | "lt"
  | "rt"
  | "view"
  | "start";

export type GamepadAction =
  | { type: "move"; direction: Direction }
  | { type: "press"; button: GamepadButton };

export interface PadSnapshot {
  buttons: readonly number[];
  axes: readonly number[];
}

export interface GamepadFrame {
  actions: GamepadAction[];
  scroll: number;
  active: boolean;
}

const BUTTON_INDEX: Record<GamepadButton, number> = {
  a: 0,
  b: 1,
  x: 2,
  y: 3,
  lb: 4,
  rb: 5,
  lt: 6,
  rt: 7,
  view: 8,
  start: 9,
};

const REPEATING: ReadonlySet<GamepadButton> = new Set(["lt", "rt"]);

const DPAD: [number, Direction][] = [
  [12, "up"],
  [13, "down"],
  [14, "left"],
  [15, "right"],
];

export const PRESS_THRESHOLD = 0.5;
export const STICK_THRESHOLD = 0.55;
export const SCROLL_DEADZONE = 0.2;
export const REPEAT_DELAY_MS = 380;
export const REPEAT_INTERVAL_MS = 110;

interface Held {
  since: number;
  last: number;
}

function pressed(pads: readonly PadSnapshot[], index: number): boolean {
  return pads.some((pad) => (pad.buttons[index] ?? 0) > PRESS_THRESHOLD);
}

function strongestAxis(pads: readonly PadSnapshot[], index: number): number {
  return pads.reduce((best, pad) => {
    const value = pad.axes[index] ?? 0;
    return Math.abs(value) > Math.abs(best) ? value : best;
  }, 0);
}

export function heldDirection(pads: readonly PadSnapshot[]): Direction | null {
  for (const [index, direction] of DPAD) {
    if (pressed(pads, index)) return direction;
  }

  const x = strongestAxis(pads, 0);
  const y = strongestAxis(pads, 1);
  if (Math.max(Math.abs(x), Math.abs(y)) < STICK_THRESHOLD) return null;
  if (Math.abs(x) > Math.abs(y)) return x > 0 ? "right" : "left";
  return y > 0 ? "down" : "up";
}

export function scrollAmount(pads: readonly PadSnapshot[]): number {
  const value = strongestAxis(pads, 3);
  if (Math.abs(value) < SCROLL_DEADZONE) return 0;
  const sign = value > 0 ? 1 : -1;
  const strength = (Math.abs(value) - SCROLL_DEADZONE) / (1 - SCROLL_DEADZONE);
  return sign * strength * strength;
}

export class GamepadReader {
  private direction: Direction | null = null;
  private directionHeld: Held | null = null;
  private buttons = new Map<GamepadButton, Held>();

  reset(): void {
    this.direction = null;
    this.directionHeld = null;
    this.buttons.clear();
  }

  private repeats(held: Held, now: number): boolean {
    if (now - held.since < REPEAT_DELAY_MS) return false;
    if (now - held.last < REPEAT_INTERVAL_MS) return false;
    held.last = now;
    return true;
  }

  read(pads: readonly PadSnapshot[], now: number): GamepadFrame {
    const actions: GamepadAction[] = [];

    const direction = heldDirection(pads);
    if (direction !== this.direction) {
      this.direction = direction;
      this.directionHeld = direction ? { since: now, last: now } : null;
      if (direction) actions.push({ type: "move", direction });
    } else if (
      direction &&
      this.directionHeld &&
      this.repeats(this.directionHeld, now)
    ) {
      actions.push({ type: "move", direction });
    }

    for (const [button, index] of Object.entries(BUTTON_INDEX) as [
      GamepadButton,
      number,
    ][]) {
      const isDown = pressed(pads, index);
      const held = this.buttons.get(button);
      if (!isDown) {
        this.buttons.delete(button);
        continue;
      }
      if (!held) {
        this.buttons.set(button, { since: now, last: now });
        actions.push({ type: "press", button });
        continue;
      }
      if (REPEATING.has(button) && this.repeats(held, now)) {
        actions.push({ type: "press", button });
      }
    }

    const scroll = scrollAmount(pads);
    return {
      actions,
      scroll,
      active: actions.length > 0 || scroll !== 0,
    };
  }
}

export function snapshotPads(pads: readonly (Gamepad | null)[]): PadSnapshot[] {
  return pads
    .filter((pad): pad is Gamepad => !!pad && pad.connected)
    .map((pad) => ({
      buttons: pad.buttons.map((button) =>
        button.pressed ? Math.max(button.value, 1) : button.value,
      ),
      axes: pad.axes,
    }));
}
