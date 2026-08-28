import { TimelineItem } from "./types";

export function chatToMarkdown(title: string, items: TimelineItem[]): string {
  const lines: string[] = [`# ${title}`, ""];

  for (const item of items) {
    switch (item.kind) {
      case "user":
        lines.push(`**>** ${item.text}`, "");
        break;

      case "assistant":
        if (item.text.trim() !== "") lines.push(item.text, "");
        break;

      case "tool":
        lines.push(
          `- \`${item.name}\` — ${item.status}${item.error ? `: ${item.error}` : ""}`,
        );
        break;

      case "permission":
        lines.push(
          `- permission \`${item.name}\`: ${item.decision ?? "pending"}`,
        );
        break;

      case "question":
        lines.push(`- asked: ${item.question}`);
        if (item.answer) lines.push(`- answered: ${item.answer}`);
        break;

      case "plan":
        lines.push("");
        for (const step of item.steps) {
          lines.push(`- [${step.status === "done" ? "x" : " "}] ${step.title}`);
        }
        lines.push("");
        break;

      case "stopped":
        lines.push("- stopped by the user", "");
        break;

      case "error":
        lines.push(`> error: ${item.message}`, "");
        break;
    }
  }

  return lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
