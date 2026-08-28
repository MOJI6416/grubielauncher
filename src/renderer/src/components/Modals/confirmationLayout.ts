export type ConfirmationTone =
  | "primary"
  | "danger"
  | "success"
  | "warning"
  | "default"
  | "secondary";

export type ConfirmationToneKind = "danger" | "warning" | "success" | "neutral";

export type ConfirmationButtonVariant = "default" | "destructive" | "secondary";

export interface ConfirmationButtonInput {
  color?: ConfirmationTone;
}

export interface ConfirmationSlot<T> {
  button: T;
  index: number;
  variant: ConfirmationButtonVariant;
  isPrimary: boolean;
}

const TONE_WEIGHT: Record<string, number> = {
  danger: 3,
  warning: 2,
  success: 1,
};

const CONFIRMING = new Set<ConfirmationTone>([
  "danger",
  "primary",
  "success",
  "warning",
]);

export function resolveTone(
  content: ConfirmationButtonInput[],
  buttons: ConfirmationButtonInput[],
): ConfirmationToneKind {
  let weight = 0;
  let best: ConfirmationTone | undefined;

  for (const item of [...content, ...buttons]) {
    const itemWeight = TONE_WEIGHT[item.color ?? ""] ?? 0;
    if (itemWeight <= weight) continue;

    weight = itemWeight;
    best = item.color;
  }

  if (best === "danger") return "danger";
  if (best === "warning") return "warning";
  if (best === "success") return "success";

  return "neutral";
}

export function primaryButtonIndex(buttons: ConfirmationButtonInput[]): number {
  if (buttons.length === 0) return -1;

  const colored = buttons.findIndex(
    (button) => button.color && CONFIRMING.has(button.color),
  );

  return colored === -1 ? buttons.length - 1 : colored;
}

export function orderButtons<T extends ConfirmationButtonInput>(
  buttons: T[],
): ConfirmationSlot<T>[] {
  const primary = primaryButtonIndex(buttons);

  const slot = (button: T, index: number): ConfirmationSlot<T> => ({
    button,
    index,
    isPrimary: index === primary,
    variant:
      index !== primary
        ? "secondary"
        : button.color === "danger"
          ? "destructive"
          : "default",
  });

  const dismissive = buttons.map(slot).filter((entry) => !entry.isPrimary);

  return primary === -1
    ? dismissive
    : [...dismissive, slot(buttons[primary], primary)];
}
