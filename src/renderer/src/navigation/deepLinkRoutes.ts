import { AccountType } from "@/types/Account";
import { CatalogLink, LauncherDeepLink } from "@/types/DeepLink";

export interface DeepLinkContext {
  hasAccount: boolean;
  accountType: AccountType | null;
  hasAccessToken: boolean;
}

export type DeepLinkIntent =
  | {
      kind: "launch";
      versionName: string;
      instance: number;
      world?: string;
      server?: string;
      confirm?: boolean;
    }
  | { kind: "groupJoin"; code: string }
  | { kind: "skin"; skinId: string }
  | { kind: "theme"; themeId: string }
  | { kind: "webLogin"; requestId: string }
  | { kind: "friendRequest"; userId: string }
  | { kind: "pack"; shareCode: string }
  | { kind: "catalog"; link: CatalogLink }
  | { kind: "notice"; level: "info" | "error"; messageKey: string };

export function resolveDeepLink(
  payload: LauncherDeepLink,
  context: DeepLinkContext,
): DeepLinkIntent {
  switch (payload.type) {
    case "launch":
      return {
        kind: "launch",
        versionName: payload.versionName,
        instance: payload.instance,
        ...(payload.world ? { world: payload.world } : {}),
        ...(payload.server ? { server: payload.server } : {}),
        ...(payload.server && payload.confirm ? { confirm: true } : {}),
      };

    case "groupJoin":
      if (!context.hasAccessToken) {
        return {
          kind: "notice",
          level: "error",
          messageKey: "groups.codeNotFound",
        };
      }
      return { kind: "groupJoin", code: payload.code };

    case "skin":
      if (!context.hasAccount) {
        return {
          kind: "notice",
          level: "info",
          messageKey: "manageSkins.deepLinkNoAccount",
        };
      }
      if (context.accountType === "plain") {
        return {
          kind: "notice",
          level: "info",
          messageKey: "manageSkins.deepLinkPlain",
        };
      }
      if (context.accountType === "elyby") {
        return {
          kind: "notice",
          level: "info",
          messageKey: "manageSkins.deepLinkElyby",
        };
      }
      if (context.accountType === "littleskin") {
        return {
          kind: "notice",
          level: "info",
          messageKey: "manageSkins.deepLinkLittleskin",
        };
      }
      return { kind: "skin", skinId: payload.id };

    case "theme":
      return { kind: "theme", themeId: payload.id };

    case "webLogin":
      return { kind: "webLogin", requestId: payload.requestId };

    case "friend":
      if (!context.hasAccessToken) {
        return {
          kind: "notice",
          level: "info",
          messageKey: "friends.deepLinkNoAccount",
        };
      }
      return { kind: "friendRequest", userId: payload.userId };

    case "pack":
      return { kind: "pack", shareCode: payload.shareCode };

    case "catalog":
      return {
        kind: "catalog",
        link: {
          provider: payload.provider,
          target: payload.target,
          id: payload.id,
          ...(payload.fileId ? { fileId: payload.fileId } : {}),
        },
      };
  }
}
