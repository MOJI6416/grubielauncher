import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const [beforeLabel = "before", afterLabel = "after"] = process.argv.slice(2);

function load(label) {
  const result = JSON.parse(fs.readFileSync(path.join(here, "results", `${label}.json`), "utf8"));
  const memoryFile = path.join(here, "results", `${label}-memory.json`);
  if (fs.existsSync(memoryFile)) {
    result.summary.memory = JSON.parse(fs.readFileSync(memoryFile, "utf8")).summary.memory;
  }
  return result.summary;
}

const before = load(beforeLabel);
const after = load(afterLabel);

const delta = (a, b) => {
  if (a == null || b == null) return "—";
  if (a === 0) return b === 0 ? "0" : `+${b}`;
  const pct = Math.round(((b - a) / a) * 100);
  return `${pct > 0 ? "+" : ""}${pct}%`;
};
const row = (cells) => `| ${cells.join(" | ")} |`;
const lines = [];

lines.push("## Старт");
lines.push(row(["метрика", "холодный до", "холодный после", "Δ", "тёплый до", "тёплый после", "Δ"]));
lines.push(row(Array(7).fill("---")));
for (const metric of ["appReady", "windowCreated", "shell", "home", "mainToHome", "startupTbt", "startupMaxFrame", "privateMB", "heapMB"]) {
  const c0 = before.startup.cold?.[metric];
  const c1 = after.startup.cold?.[metric];
  const w0 = before.startup.warm?.[metric];
  const w1 = after.startup.warm?.[metric];
  lines.push(row([metric, c0 ?? "—", c1 ?? "—", delta(c0, c1), w0 ?? "—", w1 ?? "—", delta(w0, w1)]));
}

lines.push("");
lines.push("## Экраны и действия (мс; первый заход / повторный)");
lines.push(row(["шаг", "готов до", "готов после", "затих до", "затих после", "INP до", "INP после", "TBT до", "TBT после"]));
lines.push(row(Array(9).fill("---")));
for (const [id, step] of Object.entries(after.steps)) {
  const old = before.steps[id];
  if (!old) continue;
  if (step.kind === "frames") {
    lines.push(row([id, `p95 ${old.warm.p95Frame ?? "—"}`, `p95 ${step.warm.p95Frame}`, `>33мс ${old.warm.over33Pct ?? "—"}%`, `>33мс ${step.warm.over33Pct}%`, "", "", old.warm.tbt, step.warm.tbt]));
    continue;
  }
  const pair = (s, key) => `${s.cold[key] ?? "—"} / ${s.warm[key] ?? "—"}`;
  lines.push(row([id, pair(old, "ready"), pair(step, "ready"), pair(old, "settle"), pair(step, "settle"), pair(old, "inp"), pair(step, "inp"), pair(old, "tbt"), pair(step, "tbt")]));
}

lines.push("");
lines.push("## Память (маршрут по всем экранам, 5 кругов)");
lines.push(row(["точка", "private до", "private после", "куча до", "куча после", "узлы до", "узлы после", "обработчики до", "обработчики после"]));
lines.push(row(Array(9).fill("---")));
for (const stage of ["idle", "afterFirstTour", "afterLastTour"]) {
  const a = before.memory?.[stage];
  const b = after.memory?.[stage];
  if (!a || !b) continue;
  lines.push(row([stage, a.privateMB, b.privateMB, a.heapMB, b.heapMB, a.nodes, b.nodes, a.listeners, b.listeners]));
}

const output = lines.join("\n");
console.log(output);
fs.writeFileSync(path.join(here, "results", `compare-${beforeLabel}-${afterLabel}.md`), output);
