import { getDefaultStore } from "jotai";
import { AgentTool, ToolPreview } from "../types";
import { instanceKey } from "@renderer/features/instances/selectors";
import { navigate } from "@renderer/navigation/navigate";
import {
  bisectSetupAtom,
  loadBisect,
} from "@renderer/features/bisect/bisectStore";
import {
  culpritsOf,
  runsDone,
  sessionStep,
} from "@renderer/features/bisect/bisectSession";
import { findInstance } from "./instances";
import { previewList } from "./shared";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";

function titles(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 500)
    : [];
}

export const findCulpritMods: AgentTool = {
  name: "find_culprit_mods",
  risk: "write",
  description:
    "Open the mod culprit search (bisect) for an instance. The wizard switches part of the mods off, the user launches the game and answers whether the problem is still there; after a few runs it is down to one mod or a pair. Copies of one mod (same mod id) are checked first. Every mod comes back as it was when the user leaves the wizard, even after a launcher restart. Use it when a crash, lag or visual bug is not explained by the logs and a mod is suspected, or when the user asks which mod causes something. You cannot answer the wizard for the user. If a search is already running, this returns its state.",
  parameters: {
    type: "object",
    properties: {
      instance: { type: "string", description: "Exact instance name" },
      keep: {
        type: "array",
        items: { type: "string" },
        description:
          "Titles of mods that must stay on during the search, e.g. the mod the problem is about. Titles exactly as get_instance returned them",
      },
      only: {
        type: "array",
        items: { type: "string" },
        description:
          "Limit the search to these mod titles; every other mod stays on",
      },
    },
    required: ["instance"],
  },
  summarize: (input) => ({
    key: "agent.tools.findCulprit",
    params: { name: input?.instance },
  }),
  preview: async (input): Promise<ToolPreview | null> => {
    const version = findInstance(input?.instance);
    if (!version) return null;
    const keep = titles(input?.keep);
    const only = titles(input?.only);
    return {
      rows: [
        { key: "instance", value: version.version.name },
        ...(keep.length > 0 ? [{ key: "keepOn", value: previewList(keep) }] : []),
        ...(only.length > 0
          ? [{ key: "searchAmong", value: previewList(only) }]
          : []),
      ],
    };
  },
  run: async (input) => {
    const version = findInstance(input?.instance);
    if (!version) {
      return { ok: false, error: `No instance named "${input?.instance}"` };
    }
    if (version.version.loader?.name === "vanilla") {
      return { ok: false, error: "This instance has no mod loader, so there are no mods to search." };
    }

    const session = await loadBisect(version.versionPath).catch(ignoreFailure);
    const opened = navigate({
      name: "instance",
      id: instanceKey(version),
      tab: "bisect",
    });

    if (session) {
      const step = sessionStep(session);
      return {
        ok: true,
        data: {
          state: "running",
          step: step.kind,
          runsDone: runsDone(session),
          suspects: session.plan.order.length,
          culprits: culpritsOf(step).map((file) => session.labels[file] || file),
          opened,
        },
      };
    }

    const keep = titles(input?.keep);
    const only = titles(input?.only);
    getDefaultStore().set(bisectSetupAtom, {
      versionPath: version.versionPath,
      ...(keep.length > 0 ? { kept: keep } : {}),
      ...(only.length > 0 ? { candidates: only } : {}),
    });

    return {
      ok: true,
      data: {
        state: "setup",
        opened,
        note: opened
          ? "The wizard is open. Tell the user to press Start, launch the game, check the problem and answer after each run."
          : "The launcher could not switch screens (unsaved changes are open). Tell the user to open the instance's culprit search tab.",
      },
    };
  },
};
