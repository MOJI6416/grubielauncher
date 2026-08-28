import { describe, expect, it } from "vitest";
import { classifyAgentError } from "./providerErrors";

describe("classifyAgentError", () => {
  it("keeps internal run failures on their own keys", () => {
    const report = classifyAgentError({
      message: "stepLimit",
      code: "AGENT-STEPS",
    });

    expect(report.kind).toBe("stepLimit");
    expect(report.titleKey).toBe("agent.errors.stepLimit.title");
    expect(report.recovery).toBe("continue");
    expect(report.detail).toBeNull();
  });

  it("reads an empty turn with tools as a model without tool calling", () => {
    const report = classifyAgentError({ message: "emptyTurnWithTools" });

    expect(report.kind).toBe("noTools");
    expect(report.recovery).toBe("model");
  });

  it("routes an invalid key to the provider settings", () => {
    const report = classifyAgentError({
      message: "No auth credentials found",
      code: "AI-401",
    });

    expect(report.kind).toBe("auth");
    expect(report.recovery).toBe("providers");
    expect(report.detail).toBe("No auth credentials found");
  });

  it("classifies a payment failure by status alone", () => {
    expect(classifyAgentError({ message: "", code: "AI-402" }).kind).toBe(
      "credit",
    );
  });

  it("classifies rate limiting from the message", () => {
    const report = classifyAgentError({
      message: "Provider returned Rate limit exceeded, retry later",
      code: "AI-429",
    });

    expect(report.kind).toBe("rateLimit");
    expect(report.recovery).toBe("retry");
  });

  it("suggests a new chat when the context window overflows", () => {
    const report = classifyAgentError({
      message: "This model's maximum context length is 8192 tokens",
      code: "AI-400",
    });

    expect(report.kind).toBe("context");
    expect(report.recovery).toBe("newChat");
  });

  it("suggests another model when the provider refuses tools", () => {
    const report = classifyAgentError({
      message: "Tool use is not supported by this model",
      code: "AI-400",
    });

    expect(report.kind).toBe("noTools");
    expect(report.recovery).toBe("model");
  });

  it("suggests another model when the model id is unknown", () => {
    const report = classifyAgentError({
      message: "No endpoints found for openai/ghost",
      code: "AI-404",
    });

    expect(report.kind).toBe("badModel");
    expect(report.recovery).toBe("model");
  });

  it("classifies a stalled stream as a timeout", () => {
    const report = classifyAgentError({
      message: "The provider sent nothing for 90s",
      code: "AI-TIMEOUT",
    });

    expect(report.kind).toBe("timeout");
  });

  it("sends a network failure to the connectivity check", () => {
    const report = classifyAgentError({
      message: "fetch failed",
      code: "AI-NETWORK",
    });

    expect(report.kind).toBe("network");
    expect(report.recovery).toBe("connectivity");
  });

  it("treats a 5xx as a provider outage worth retrying", () => {
    expect(
      classifyAgentError({ message: "Bad gateway", code: "AI-502" }).kind,
    ).toBe("server");
  });

  it("falls back to retry for anything it cannot place", () => {
    const report = classifyAgentError({ message: "something odd happened" });

    expect(report.kind).toBe("unknown");
    expect(report.recovery).toBe("retry");
    expect(report.code).toBeNull();
  });

  it("reads the status out of a bare provider message with no code", () => {
    expect(
      classifyAgentError({ message: "Provider responded with status 401" })
        .kind,
    ).toBe("auth");
    expect(
      classifyAgentError({ message: "Provider responded with status 402" })
        .kind,
    ).toBe("credit");
    expect(
      classifyAgentError({ message: "Provider responded with status 429" })
        .kind,
    ).toBe("rateLimit");
    expect(
      classifyAgentError({ message: "Provider responded with status 503" })
        .kind,
    ).toBe("server");
  });

  it("ignores numbers that are not a status", () => {
    expect(
      classifyAgentError({ message: "model gpt-oss code 120b is busy" }).kind,
    ).toBe("unknown");
  });

  it("shortens a long provider message for the detail line", () => {
    const report = classifyAgentError({ message: "x".repeat(400) });

    expect(report.detail).toHaveLength(241);
    expect(report.detail?.endsWith("…")).toBe(true);
  });
});
