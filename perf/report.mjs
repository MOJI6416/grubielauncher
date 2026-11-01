export function checkBudgets(summary, budgets) {
  const rows = [];
  const check = (scope, metric, actual, limit) => {
    if (limit == null || actual == null) return;
    rows.push({ scope, metric, actual, limit, ok: actual <= limit });
  };
  for (const [kind, limits] of Object.entries(budgets.startup ?? {})) {
    for (const [metric, limit] of Object.entries(limits)) check(`startup.${kind}`, metric, summary.startup[kind]?.[metric], limit);
  }
  for (const [stage, limits] of Object.entries(budgets.memory ?? {})) {
    if (stage === "growth") continue;
    for (const [metric, limit] of Object.entries(limits)) check(`memory.${stage}`, metric, summary.memory[stage]?.[metric], limit);
  }
  const first = summary.memory.afterFirstTour;
  const last = summary.memory.afterLastTour;
  if (first && last && budgets.memory?.growth) {
    for (const [metric, limit] of Object.entries(budgets.memory.growth)) {
      check("memory.growth", metric, Math.round((last[metric] - first[metric]) * 10) / 10, limit);
    }
  }
  for (const [id, step] of Object.entries(summary.steps)) {
    const own = budgets.steps?.[id] ?? {};
    const defaults = budgets.defaults?.[step.kind ?? "nav"] ?? {};
    for (const phase of ["cold", "warm"]) {
      const limits = { ...(defaults[phase] ?? {}), ...(own[phase] ?? {}) };
      for (const [metric, limit] of Object.entries(limits)) check(`${id}.${phase}`, metric, step[phase]?.[metric], limit);
    }
    if (step.errors) rows.push({ scope: id, metric: "errors", actual: step.errors, limit: 0, ok: false });
  }
  return { passed: rows.filter((row) => row.ok).length, failed: rows.filter((row) => !row.ok), total: rows.length };
}

const pad = (value, width) => String(value ?? "—").padStart(width);

export function formatReport(summary, budget) {
  const lines = [];
  for (const [kind, data] of Object.entries(summary.startup)) {
    lines.push(`startup ${kind}: shell ${data.shell} ms · home ${data.home} ms (window→home ${data.mainToHome}) · fcp ${data.fcp} · tbt ${data.startupTbt} · private ${data.privateMB} MB · heap ${data.heapMB} MB`);
  }
  lines.push("");
  lines.push(`${"step".padEnd(26)} ${"ready c/w".padStart(11)} ${"settle c/w".padStart(11)} ${"inp".padStart(5)} ${"tbt".padStart(5)} ${"maxLoAF".padStart(8)}`);
  for (const [id, step] of Object.entries(summary.steps)) {
    if (step.kind === "frames") {
      lines.push(`${id.padEnd(26)} p95 ${step.warm.p95Frame} ms · >17ms ${step.warm.over17Pct}% · >33ms ${step.warm.over33Pct}% · tbt ${step.warm.tbt}`);
      continue;
    }
    const flags = `${step.errors ? ` errors:${step.errors}` : ""}${step.timeouts ? ` timeouts:${step.timeouts}` : ""}`;
    lines.push(`${id.padEnd(26)} ${pad(`${step.cold.ready ?? "—"}/${step.warm.ready ?? "—"}`, 11)} ${pad(`${step.cold.settle}/${step.warm.settle}`, 11)} ${pad(step.warm.inp, 5)} ${pad(step.warm.tbt, 5)} ${pad(step.warm.maxFrame, 8)}${flags}`);
  }
  lines.push("");
  for (const [stage, data] of Object.entries(summary.memory)) {
    if (!data) continue;
    lines.push(`memory ${stage}: private ${data.privateMB} MB (renderer ${data.byType?.Tab ?? "—"}, gpu ${data.byType?.GPU ?? "—"}, main ${data.byType?.Browser ?? "—"}) · heap ${data.heapMB} MB · nodes ${data.nodes} · listeners ${data.listeners}`);
  }
  if (budget) {
    lines.push("");
    lines.push(`budgets: ${budget.passed}/${budget.total} ok`);
    for (const row of budget.failed) lines.push(`  ✗ ${row.scope} ${row.metric}: ${row.actual} > ${row.limit}`);
  }
  return lines.join("\n");
}
