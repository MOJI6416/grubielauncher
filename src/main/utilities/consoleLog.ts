import { StringDecoder } from "string_decoder";

export const MAX_CONSOLE_LINE_LENGTH = 8192;

export function createLineReader(onLine: (line: string) => void) {
  const decoder = new StringDecoder("utf8");
  let buffer = "";

  const emitBuffered = (upTo: number) => {
    const line = buffer.slice(0, upTo).replace(/\r$/, "");
    buffer = buffer.slice(upTo + 1);
    onLine(line);
  };

  return {
    push(chunk: Buffer) {
      buffer += decoder.write(chunk);

      let index = buffer.indexOf("\n");
      while (index !== -1) {
        emitBuffered(index);
        index = buffer.indexOf("\n");
      }

      while (buffer.length > MAX_CONSOLE_LINE_LENGTH) {
        onLine(buffer.slice(0, MAX_CONSOLE_LINE_LENGTH));
        buffer = buffer.slice(MAX_CONSOLE_LINE_LENGTH);
      }
    },
    flush() {
      buffer += decoder.end();
      if (!buffer) return;
      onLine(buffer.replace(/\r$/, ""));
      buffer = "";
    },
  };
}

const ERROR_LEVEL = /[[/](?:ERROR|FATAL|SEVERE)\]/i;
const NON_ERROR_LEVEL =
  /[[/](?:INFO|WARN|WARNING|DEBUG|TRACE|FINE|FINER|FINEST|CONFIG|NOTICE)\]/i;

export function classifyConsoleStream(
  message: string,
  stream: "stdout" | "stderr",
): "info" | "error" {
  if (ERROR_LEVEL.test(message)) return "error";
  if (NON_ERROR_LEVEL.test(message)) return "info";
  return stream === "stderr" ? "error" : "info";
}
