import { describe, expect, it } from "vitest";
import { operationErrorMessage } from "./useVoicePing";

const t = (key: string) =>
  key === "friends.operationErrors.not_in_voice"
    ? "Вы не в голосовой комнате этой группы."
    : key === "friends.operationErrors.unknown"
      ? "Не удалось выполнить действие."
      : key;

describe("operationErrorMessage", () => {
  it("uses the translated reason when the code is known", () => {
    expect(operationErrorMessage(t, "not_in_voice")).toBe(
      "Вы не в голосовой комнате этой группы.",
    );
  });

  it("falls back to the generic message for an unmapped code", () => {
    expect(operationErrorMessage(t, "brand_new_code")).toBe(
      "Не удалось выполнить действие.",
    );
  });

  it("falls back when the server sends no code at all", () => {
    expect(operationErrorMessage(t, undefined)).toBe(
      "Не удалось выполнить действие.",
    );
  });
});
