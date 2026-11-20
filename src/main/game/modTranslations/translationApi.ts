import { BaseService } from "../../services/Base";
import type { ModContext } from "./modContext";
import type { LangEntries } from "./unitHash";

export interface RemotePack {
  key: string;
  title: string;
  author: string;
  license: string;
  projectUrl: string;
  source: string;
  projectId: string;
  fileId: string;
  versionName: string;
  fileName: string;
  url: string;
  sha1: string;
  size: number;
  covers: number;
}

export type RemoteUnitStatus = "done" | "pending" | "failed" | "missing";

export interface RemoteUnit {
  hash: string;
  status: RemoteUnitStatus;
  entries?: LangEntries;
}

export interface SubmitUnit {
  hash: string;
  namespace: string;
  entries: LangEntries;
  kind?: "book";
  context?: ModContext;
}

export interface SubmitResult {
  accepted: string[];
  queued: number;
  rejected: Array<{ hash: string; reason: string }>;
}

export class TranslationApiUnavailable extends Error {}

function statusOf(error: unknown): number | undefined {
  return (error as { response?: { status?: number } })?.response?.status;
}

export const UNSUPPORTED_REASON = "unsupported";

export class TranslationApi extends BaseService {
  private legacy = false;

  private url(path: string) {
    return `${this.baseUrl}/mod-translations${path}`;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    try {
      const { data } = await this.api.post<T>(this.url(path), body, {
        timeout: 60000,
      });
      return data;
    } catch (error) {
      if (statusOf(error) === 404) {
        throw new TranslationApiUnavailable("mod-translations is not deployed");
      }
      throw error;
    }
  }

  async matchPacks(request: {
    lang: string;
    mcVersion: string;
    namespaces: string[];
    skipProjects: string[];
  }): Promise<RemotePack[]> {
    const { packs } = await this.post<{ packs: RemotePack[] }>(
      "/packs",
      request,
    );
    return Array.isArray(packs) ? packs : [];
  }

  async lookup(lang: string, hashes: string[]): Promise<RemoteUnit[]> {
    const { units } = await this.post<{ units: RemoteUnit[] }>(
      "/units/lookup",
      { lang, hashes },
    );
    return Array.isArray(units) ? units : [];
  }

  async submit(lang: string, units: SubmitUnit[]): Promise<SubmitResult> {
    const extended = units.some((unit) => unit.kind || unit.context);
    if (!this.legacy || !extended) {
      try {
        return await this.post<SubmitResult>("/units", { lang, units });
      } catch (error) {
        if (statusOf(error) !== 400 || !extended) throw error;
        this.legacy = true;
      }
    }
    const plain = units
      .filter((unit) => !unit.kind)
      .map(({ hash, namespace, entries }) => ({ hash, namespace, entries }));
    const unsupported = units
      .filter((unit) => unit.kind)
      .map((unit) => ({ hash: unit.hash, reason: UNSUPPORTED_REASON }));
    if (plain.length === 0) {
      return { accepted: [], queued: 0, rejected: unsupported };
    }
    const result = await this.post<SubmitResult>("/units", {
      lang,
      units: plain,
    });
    return { ...result, rejected: [...(result.rejected ?? []), ...unsupported] };
  }

  hasToken(): boolean {
    return !!this.accessToken;
  }
}

export function isUnauthorized(error: unknown): boolean {
  return statusOf(error) === 401;
}
