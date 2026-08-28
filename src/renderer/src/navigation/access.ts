import { AccountType } from "@/types/Account";
import { Route, RouteName } from "./routes";

export type RouteBlockReason = "noAccount" | "offlineAccount";

export interface RouteAccessContext {
  accountType: AccountType | null;
}

const ONLINE_ACCOUNT_ROUTES: RouteName[] = ["agent", "people", "profile"];

export function routeBlockReason(
  route: Route,
  context: RouteAccessContext,
): RouteBlockReason | null {
  if (!ONLINE_ACCOUNT_ROUTES.includes(route.name)) return null;
  if (!context.accountType) return "noAccount";
  if (context.accountType === "plain") return "offlineAccount";

  return null;
}

export function isRouteAllowed(
  route: Route,
  context: RouteAccessContext,
): boolean {
  return routeBlockReason(route, context) === null;
}

export function agentBlockReason(
  accountType: AccountType | null | undefined,
): RouteBlockReason | null {
  return routeBlockReason(
    { name: "agent" },
    {
      accountType: accountType ?? null,
    },
  );
}

export function blockReasonKey(reason: RouteBlockReason): string {
  return reason === "noAccount"
    ? "agent.blocked.noAccount"
    : "agent.blocked.offlineAccount";
}

export function routeBlockedKey(reason: RouteBlockReason): string {
  return reason === "noAccount"
    ? "app.routeBlocked.noAccount"
    : "app.routeBlocked.offlineAccount";
}

export function blockReasonShortKey(reason: RouteBlockReason): string {
  return reason === "noAccount"
    ? "agent.blocked.noAccountShort"
    : "agent.blocked.offlineAccountShort";
}
