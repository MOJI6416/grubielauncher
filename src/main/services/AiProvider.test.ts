import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentStreamEvent, AgentStreamRequest } from "@/types/Agent";
import { listModels, streamChat } from "./AiProvider";

function streamResponse(events: unknown[], status = 200): Response {
  const body = [
    ...events.map((event) => `data: ${JSON.stringify(event)}`),
    "data: [DONE]",
    "",
  ].join("\n\n");
  return new Response(body, { status });
}

function request(
  overrides: Partial<AgentStreamRequest> = {},
): AgentStreamRequest {
  return {
    providerId: "provider",
    messages: [{ role: "user", content: "Hello" }],
    ...overrides,
  };
}

async function run(
  model: string,
  value: AgentStreamRequest,
): Promise<AgentStreamEvent[]> {
  const events: AgentStreamEvent[] = [];
  await streamChat(
    "test-run",
    "https://example.test/v1",
    "key",
    model,
    value,
    (event) => events.push(event),
  );
  return events;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("streamChat API routing", () => {
  it("keeps ordinary chat on Chat Completions", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        streamResponse([
          { choices: [{ delta: { content: "Hi" }, finish_reason: null }] },
          { choices: [{ delta: {}, finish_reason: "stop" }] },
        ]),
      );
    vi.stubGlobal("fetch", fetchMock);

    const events = await run("gpt-4.1", request());

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://example.test/v1/chat/completions",
    );
    expect(events).toContainEqual({
      runId: "test-run",
      type: "text",
      delta: "Hi",
    });
  });

  it("uses Responses for reasoning and maps its stream", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse([
        { type: "response.reasoning_summary_text.delta", delta: "Thinking" },
        { type: "response.output_text.delta", delta: "Answer" },
        {
          type: "response.completed",
          response: {
            status: "completed",
            usage: { input_tokens: 3, output_tokens: 4, total_tokens: 7 },
          },
        },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const events = await run(
      "gpt-5.6-terra",
      request({ reasoningEffort: "medium" }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://example.test/v1/responses",
    );
    expect(body.reasoning).toEqual({ effort: "medium" });
    expect(events).toContainEqual({
      runId: "test-run",
      type: "reasoning",
      delta: "Thinking",
    });
    expect(events).toContainEqual({
      runId: "test-run",
      type: "text",
      delta: "Answer",
    });
  });

  it("uses Responses tool schema and reads function calls", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse([
        {
          type: "response.output_item.done",
          output_index: 0,
          item: {
            type: "function_call",
            call_id: "call_1",
            name: "get_time",
            arguments: "{}",
          },
        },
        { type: "response.completed", response: { status: "completed" } },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const events = await run(
      "gpt-5.6-luna",
      request({
        reasoningEffort: "high",
        messages: [
          { role: "system", content: "Be helpful" },
          {
            role: "assistant",
            content: "",
            toolCalls: [
              { id: "previous_call", name: "get_time", arguments: "{}" },
            ],
          },
          { role: "tool", toolCallId: "previous_call", content: "12:00" },
          { role: "user", content: "Check again" },
        ],
        tools: [
          {
            name: "get_time",
            description: "Get time",
            parameters: { type: "object", properties: {} },
          },
        ],
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://example.test/v1/responses",
    );
    expect(body.tools[0]).toEqual({
      type: "function",
      name: "get_time",
      description: "Get time",
      parameters: { type: "object", properties: {} },
    });
    expect(body.input).toEqual([
      { role: "system", content: "Be helpful" },
      {
        type: "function_call",
        call_id: "previous_call",
        name: "get_time",
        arguments: "{}",
      },
      {
        type: "function_call_output",
        call_id: "previous_call",
        output: "12:00",
      },
      { role: "user", content: "Check again" },
    ]);
    expect(events).toContainEqual({
      runId: "test-run",
      type: "toolCalls",
      calls: [{ id: "call_1", name: "get_time", arguments: "{}" }],
    });
  });

  it("falls back to reasoning none only after a compatibility error", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              message: "Function tools with reasoning_effort are not supported",
            },
          }),
          { status: 400 },
        ),
      )
      .mockResolvedValueOnce(
        streamResponse([
          { choices: [{ delta: { content: "Done" }, finish_reason: "stop" }] },
        ]),
      );
    vi.stubGlobal("fetch", fetchMock);

    await run(
      "provider/model",
      request({
        reasoningEffort: "high",
        tools: [
          {
            name: "get_time",
            description: "Get time",
            parameters: { type: "object", properties: {} },
          },
        ],
      }),
    );
    const firstChatBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    const retryBody = JSON.parse(fetchMock.mock.calls[2][1].body);

    expect(firstChatBody.reasoning_effort).toBe("high");
    expect(retryBody.reasoning_effort).toBe("none");
  });
});

describe("listModels capabilities", () => {
  it("marks every GPT-5.6 tier as tool-capable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [
              { id: "gpt-5.6-sol", supported_parameters: [] },
              { id: "gpt-5.6-terra", supported_parameters: [] },
              { id: "gpt-5.6-luna", supported_parameters: [] },
            ],
          }),
          { status: 200 },
        ),
      ),
    );

    const models = await listModels("https://example.test/v1", "key");

    expect(models.map((model) => model.supportsTools)).toEqual([
      true,
      true,
      true,
    ]);
  });
});
