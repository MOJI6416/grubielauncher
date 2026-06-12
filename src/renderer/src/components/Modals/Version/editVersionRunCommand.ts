export function quoteRunCommandArg(arg: string) {
  if (arg === "") return '""';
  if (!/[\s"&^<>|()]/.test(arg)) return arg;

  let quoted = '"';
  let backslashes = 0;

  for (const char of arg) {
    if (char === "\\") {
      backslashes++;
      continue;
    }

    if (char === '"') {
      quoted += "\\".repeat(backslashes * 2 + 1);
      quoted += char;
      backslashes = 0;
      continue;
    }

    quoted += "\\".repeat(backslashes);
    quoted += char;
    backslashes = 0;
  }

  quoted += "\\".repeat(backslashes * 2);
  quoted += '"';
  return quoted;
}

export function formatRunCommandForClipboard(command: string[]) {
  return command.map(quoteRunCommandArg).join(" ");
}
