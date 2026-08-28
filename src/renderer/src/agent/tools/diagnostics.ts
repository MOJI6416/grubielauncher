import { getDefaultStore } from "jotai";
import { GameLogKind, IGameLogFile } from "@/types/GameLog";
import { prepareLogForAnalysis } from "@/shared/logSanitizer";
import { accountAtom, consolesAtom } from "@renderer/stores/atoms";
import { AgentTool } from "../types";
import { limitList, truncate, wrapUntrusted } from "../untrusted";
import { findInstance } from "./instances";

const api = window.api;

const MAX_LOG_LINES = 200;
const MAX_LOG_CHARS = 12000;
const MAX_CRASH_CHARS = 16000;
const MAX_SERVERS = 30;
const MAX_LISTED_FILES = 20;

function describeFiles(files: IGameLogFile[]) {
  const limited = limitList(files, MAX_LISTED_FILES);

  return {
    files: limited.items.map((file) => ({
      file: file.name,
      kind: file.kind,
      sizeBytes: file.size,
      modifiedAt: new Date(file.modifiedAt).toISOString(),
    })),
    totalFiles: limited.total,
    filesTruncated: limited.truncated,
  };
}

function pickDefaultFile(files: IGameLogFile[]): IGameLogFile | undefined {
  return (
    files.find((file) => file.kind === "crash") ??
    files.find((file) => file.kind === "latest") ??
    files[0]
  );
}

function tailLines(text: string, wanted: number, onlyErrors: boolean): string {
  const lines = text.split(/\r?\n/);
  const filtered = onlyErrors
    ? lines.filter((line) => /error|exception|caused by|fatal/i.test(line))
    : lines;

  return filtered.slice(-wanted).join("\n");
}

export const readGameLog: AgentTool = {
  name: "read_game_log",
  risk: "read",
  description:
    "Read the game log of an instance. By default it reads the live console of a run from this launcher session, and falls back to the log files on disk when there is none — so a crash from a previous day is still readable. Pass `file` with a name from the returned `files` list to read a specific log, archive or crash report. When a file is read, `diagnosis` carries the verdict of the launcher's own local rule engine: check it before reading the log yourself, it costs nothing and it already names the culprit when a rule matches.",
  parameters: {
    type: "object",
    properties: {
      instance: { type: "string", description: "Exact instance name" },
      file: {
        type: "string",
        description:
          "Name of a log file from the files list. Omit to read the live console, or the newest crash report or latest.log when there is no live console.",
      },
      onlyErrors: { type: "boolean", description: "Keep only error lines" },
      lines: { type: "number", description: "1-200, defaults to 200" },
    },
    required: ["instance"],
  },
  summarize: (input) => ({
    key: "agent.tools.readGameLog",
    params: { name: input?.instance },
  }),
  run: async (input) => {
    const store = getDefaultStore();
    const version = findInstance(input?.instance);
    if (!version) {
      return { ok: false, error: `No instance named "${input?.instance}"` };
    }

    const wanted = Math.min(
      MAX_LOG_LINES,
      Math.max(1, Number(input?.lines) || MAX_LOG_LINES),
    );
    const onlyErrors = input?.onlyErrors === true;

    const files = (await api.logs.list(version.versionPath)) ?? [];
    const requestedFile =
      typeof input?.file === "string" && input.file.trim() !== ""
        ? input.file.trim()
        : null;

    if (!requestedFile) {
      const consoles = store.get(consolesAtom).consoles;
      const name = version.version.name.toLowerCase();
      const matching = consoles.filter(
        (entry) => entry.versionName.toLowerCase() === name,
      );

      if (matching.length > 0) {
        const target = matching[matching.length - 1];
        const messages = target.messages
          .filter((message) =>
            onlyErrors ? message.type === "error" : true,
          )
          .slice(-wanted)
          .map((message) => `[${message.type}] ${message.message}`);

        return {
          ok: true,
          data: {
            instance: target.versionName,
            source: "session",
            instanceNumber: target.instance,
            status: target.status,
            lines: messages.length,
            ...describeFiles(files),
            log: wrapUntrusted(truncate(messages.join("\n"), MAX_LOG_CHARS)),
          },
        };
      }
    }

    if (files.length === 0) {
      return {
        ok: false,
        error: `No console output and no log files for "${version.version.name}". The instance has never been launched, or its logs were cleared.`,
      };
    }

    const target = requestedFile
      ? files.find((file) => file.name === requestedFile)
      : pickDefaultFile(files);

    if (!target) {
      return {
        ok: false,
        error: `No log file named "${requestedFile}" in "${version.version.name}". Available: ${files
          .slice(0, MAX_LISTED_FILES)
          .map((file) => file.name)
          .join(", ")}`,
      };
    }

    const kind: GameLogKind = target.kind;
    const [content, diagnosis] = await Promise.all([
      api.logs.read(version.versionPath, target.name, kind),
      api.logs.analyze(version.versionPath, target.name, kind),
    ]);

    if (!content) {
      return {
        ok: false,
        error: `Could not read "${target.name}" of "${version.version.name}"`,
      };
    }

    const nickname = store.get(accountAtom)?.nickname;
    const sanitized = prepareLogForAnalysis(content.text, {
      maxChars: MAX_LOG_CHARS * 4,
      nickname,
    });

    return {
      ok: true,
      data: {
        instance: version.version.name,
        source: "file",
        file: target.name,
        kind,
        modifiedAt: new Date(target.modifiedAt).toISOString(),
        truncatedByLauncher: content.truncated,
        diagnosis: diagnosis?.analysis
          ? {
              ruleId: diagnosis.analysis.ruleId,
              explanation: diagnosis.analysis.messages.en,
              culprits: wrapUntrusted(diagnosis.analysis.culprits.join("\n")),
            }
          : null,
        ...describeFiles(files),
        log: wrapUntrusted(
          truncate(tailLines(sanitized, wanted, onlyErrors), MAX_LOG_CHARS),
        ),
      },
    };
  },
};

export const getLastCrash: AgentTool = {
  name: "get_last_crash",
  risk: "read",
  description:
    "Read the sanitized crash log and context of the last crash of an instance, together with the installed mod list. Paths, nicknames and tokens are already stripped. Use it to diagnose why an instance crashed.",
  parameters: {
    type: "object",
    properties: {
      instance: { type: "string", description: "Exact instance name" },
    },
    required: ["instance"],
  },
  summarize: (input) => ({
    key: "agent.tools.getLastCrash",
    params: { name: input?.instance },
  }),
  run: async (input) => {
    const version = findInstance(input?.instance);
    if (!version) {
      return { ok: false, error: `No instance named "${input?.instance}"` };
    }

    const request = await api.ai.prepareCrashReport(
      version.versionPath,
      undefined,
      undefined,
      version.version.name,
    );

    if (!request) {
      return {
        ok: false,
        error: `No crash report or log found for "${version.version.name}"`,
      };
    }

    const { mods, ...context } = request.context;

    return {
      ok: true,
      data: {
        instance: version.version.name,
        context,
        modCount: mods?.length ?? 0,
        mods: wrapUntrusted((mods ?? []).join("\n")),
        hasCrashReport: Boolean(request.reportPath),
        log: wrapUntrusted(truncate(request.log, MAX_CRASH_CHARS)),
      },
    };
  },
};

export const listServers: AgentTool = {
  name: "list_servers",
  risk: "read",
  description: "List the multiplayer servers saved in an instance server list.",
  parameters: {
    type: "object",
    properties: {
      instance: { type: "string", description: "Exact instance name" },
    },
    required: ["instance"],
  },
  summarize: (input) => ({
    key: "agent.tools.listServers",
    params: { name: input?.instance },
  }),
  run: async (input) => {
    const version = findInstance(input?.instance);
    if (!version) {
      return { ok: false, error: `No instance named "${input?.instance}"` };
    }

    const serversPath = await api.path.join(version.versionPath, "servers.dat");
    if (!(await api.fs.pathExists(serversPath))) {
      return { ok: true, data: { servers: [] } };
    }

    const servers = await api.servers.read(serversPath);
    const limited = limitList(servers ?? [], MAX_SERVERS);

    return {
      ok: true,
      data: {
        total: limited.total,
        truncated: limited.truncated,
        servers: limited.items.map((server) => ({
          name: wrapUntrusted(server.name),
          ip: server.ip,
        })),
      },
    };
  },
};
