import { Worker } from "node:worker_threads";

export interface CrashRegexJob {
  pattern: string;
  flags: string;
  capture?: boolean;
}

export type CrashRegexResult = boolean | string[];

export interface CrashRegexRun {
  results: (CrashRegexResult | null)[];
  stalledAt: number | null;
}

export const CRASH_REGEX_BUDGET_MS = 2000;

const WORKER_SOURCE = `
const { parentPort, workerData } = require("node:worker_threads");
const { text, jobs, limit } = workerData;

for (let index = 0; index < jobs.length; index += 1) {
  const job = jobs[index];
  let value;

  try {
    const expression = new RegExp(job.pattern, job.flags);
    if (!job.capture) {
      value = expression.test(text);
    } else {
      const found = [];
      let match;
      while ((match = expression.exec(text)) && found.length < limit) {
        if (match[1] && !found.includes(match[1])) found.push(match[1]);
        if (match.index === expression.lastIndex) expression.lastIndex += 1;
      }
      value = found;
    }
  } catch {
    value = job.capture ? [] : false;
  }

  parentPort.postMessage({ index, value });
}
`;

export function runCrashRegexJobs(
  text: string,
  jobs: CrashRegexJob[],
  limit: number,
  budgetMs: number = CRASH_REGEX_BUDGET_MS,
): Promise<CrashRegexRun> {
  const results: (CrashRegexResult | null)[] = jobs.map(() => null);
  if (jobs.length === 0) {
    return Promise.resolve({ results, stalledAt: null });
  }

  return new Promise((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(WORKER_SOURCE, {
        eval: true,
        workerData: { text, jobs, limit },
      });
    } catch {
      resolve({ results, stalledAt: null });
      return;
    }

    let answered = 0;
    let settled = false;
    let timer: NodeJS.Timeout | null = null;

    const finish = (stalledAt: number | null): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      void worker.terminate();
      resolve({ results, stalledAt });
    };

    timer = setTimeout(() => finish(results.indexOf(null)), budgetMs);

    worker.on("message", (message: { index: number; value: CrashRegexResult }) => {
      if (settled) return;
      if (
        !message ||
        typeof message.index !== "number" ||
        results[message.index] !== null
      ) {
        return;
      }

      results[message.index] = message.value;
      answered += 1;
      if (answered === jobs.length) finish(null);
    });
    worker.on("error", () => finish(null));
    worker.on("exit", () => finish(null));
  });
}
