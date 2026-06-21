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
