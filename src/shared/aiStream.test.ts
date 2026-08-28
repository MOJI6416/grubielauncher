import { describe, expect, it } from "vitest";
import {
  describeProviderError,
  extractChunkDelta,
  extractReasoningDetails,
  extractResponsesUsage,
  extractToolCallDeltas,
  readSsePayload,
  ResponsesToolCallAccumulator,
  splitSseBuffer,
  ToolCallAccumulator,
} from "./aiStream";

describe("splitSseBuffer", () => {
  it("keeps the trailing partial line in rest", () => {
    const result = splitSseBuffer('data: {"a":1}\ndata: {"b":');
    expect(result.lines).toEqual(['data: {"a":1}']);
    expect(result.rest).toBe('data: {"b":');
  });

  it("returns everything as rest when no newline arrived yet", () => {
    const result = splitSseBuffer("data: partial");
    expect(result.lines).toEqual([]);
    expect(result.rest).toBe("data: partial");
  });
});

describe("readSsePayload", () => {
  it("reads data lines and ignores comments and blanks", () => {
    expect(readSsePayload('data: {"a":1}')).toBe('{"a":1}');
    expect(readSsePayload("data: [DONE]")).toBe("[DONE]");
    expect(readSsePayload(": keep-alive")).toBeNull();
    expect(readSsePayload("")).toBeNull();
    expect(readSsePayload("event: ping")).toBeNull();
  });
});

describe("ToolCallAccumulator", () => {
  it("assembles arguments fragmented across chunks", () => {
    const acc = new ToolCallAccumulator();
    acc.add([
      {
        index: 0,
        id: "call_1",
        function: { name: "search_mods", arguments: "" },
      },
    ]);
    acc.add([{ index: 0, function: { arguments: '{"query":"so' } }]);
    acc.add([{ index: 0, function: { arguments: 'dium"}' } }]);

    expect(acc.result()).toEqual([
      { id: "call_1", name: "search_mods", arguments: '{"query":"sodium"}' },
    ]);
  });

  it("keeps parallel tool calls separated and ordered by index", () => {
    const acc = new ToolCallAccumulator();
    acc.add([
      {
        index: 1,
        id: "b",
        function: { name: "get_instance", arguments: "{}" },
      },
      {
        index: 0,
        id: "a",
        function: { name: "list_instances", arguments: "{}" },
      },
    ]);

    expect(acc.result().map((call) => call.name)).toEqual([
      "list_instances",
      "get_instance",
    ]);
  });

  it("falls back to a synthetic id and index when the provider omits them", () => {
    const acc = new ToolCallAccumulator();
    acc.add([{ function: { name: "list_worlds", arguments: "{}" } }]);

    expect(acc.result()).toEqual([
      { id: "call_0", name: "list_worlds", arguments: "{}" },
    ]);
  });

  it("drops slots that never received a name", () => {
    const acc = new ToolCallAccumulator();
    acc.add([{ index: 0, function: { arguments: "{}" } }]);

    expect(acc.size).toBe(1);
    expect(acc.result()).toEqual([]);
  });
});

describe("ResponsesToolCallAccumulator", () => {
  it("assembles a Responses API function call", () => {
    const acc = new ResponsesToolCallAccumulator();
    acc.add({
      type: "response.output_item.added",
      output_index: 0,
      item: { type: "function_call", call_id: "call_1", name: "list_worlds" },
    });
    acc.add({
      type: "response.function_call_arguments.delta",
      output_index: 0,
      delta: '{"instanceId":',
    });
    acc.add({
      type: "response.function_call_arguments.delta",
      output_index: 0,
      delta: '"demo"}',
    });
    acc.add({
      type: "response.output_item.done",
      output_index: 0,
      item: {
        type: "function_call",
        call_id: "call_1",
        name: "list_worlds",
        arguments: '{"instanceId":"demo"}',
      },
    });

    expect(acc.result()).toEqual([
      {
        id: "call_1",
        name: "list_worlds",
        arguments: '{"instanceId":"demo"}',
      },
    ]);
  });
});

describe("extractChunkDelta", () => {
  it("reads text, reasoning, finish reason and usage", () => {
    expect(
      extractChunkDelta({ choices: [{ delta: { content: "hi" } }] }).text,
    ).toBe("hi");

    expect(
      extractChunkDelta({ choices: [{ delta: { reasoning: "think" } }] })
        .reasoning,
    ).toBe("think");

    expect(
      extractChunkDelta({
        choices: [{ delta: { reasoning_content: "alt field" } }],
      }).reasoning,
    ).toBe("alt field");

    expect(
      extractChunkDelta({
        choices: [{ delta: {}, finish_reason: "tool_calls" }],
      }).finishReason,
    ).toBe("tool_calls");

    expect(
      extractChunkDelta({
        choices: [],
        usage: { prompt_tokens: 10, completion_tokens: 4, cost: 0.001 },
      }).usage,
    ).toEqual({ promptTokens: 10, completionTokens: 4, cost: 0.001 });
  });

  it("ignores empty content deltas", () => {
    expect(
      extractChunkDelta({ choices: [{ delta: { content: "" } }] }).text,
    ).toBeUndefined();
  });
});

describe("extractResponsesUsage", () => {
  it("maps Responses API token usage", () => {
    expect(
      extractResponsesUsage({
        input_tokens: 10,
        output_tokens: 4,
        total_tokens: 14,
      }),
    ).toEqual({ promptTokens: 10, completionTokens: 4, totalTokens: 14 });
  });
});

describe("extractToolCallDeltas", () => {
  it("returns an empty array when the chunk has none", () => {
    expect(extractToolCallDeltas({ choices: [{ delta: {} }] })).toEqual([]);
    expect(extractToolCallDeltas(null)).toEqual([]);
  });
});

describe("describeProviderError", () => {
  it("pulls the message out of an OpenAI-shaped error body", () => {
    expect(
      describeProviderError(401, '{"error":{"message":"No auth credentials"}}'),
    ).toBe("No auth credentials");
  });

  it("falls back to the raw body then to the status", () => {
    expect(describeProviderError(502, "Bad Gateway")).toBe("Bad Gateway");
    expect(describeProviderError(500, "")).toBe(
      "Provider responded with status 500",
    );
  });
});

describe("extractReasoningDetails", () => {
  it("reads the blocks a reasoning model emits", () => {
    expect(
      extractReasoningDetails({
        choices: [
          {
            delta: {
              reasoning_details: [{ type: "reasoning.text", text: "a" }],
            },
          },
        ],
      }),
    ).toEqual([{ type: "reasoning.text", text: "a" }]);
  });

  it("returns an empty array when the chunk carries none", () => {
    expect(extractReasoningDetails({ choices: [{ delta: {} }] })).toEqual([]);
    expect(extractReasoningDetails(null)).toEqual([]);
  });
});
