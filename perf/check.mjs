import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkBudgets, formatReport } from "./report.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const label = process.argv[2] || "after";
const result = JSON.parse(fs.readFileSync(path.join(here, "results", `${label}.json`), "utf8"));
const memoryFile = path.join(here, "results", `${label}-memory.json`);
if (fs.existsSync(memoryFile)) {
  result.summary.memory = JSON.parse(fs.readFileSync(memoryFile, "utf8")).summary.memory;
}
const budgets = JSON.parse(fs.readFileSync(path.join(here, "budgets.json"), "utf8"));
const budget = checkBudgets(result.summary, budgets);
console.log(formatReport(result.summary, budget));
process.exitCode = budget.failed.length ? 1 : 0;
