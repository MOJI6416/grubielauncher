export type InstanceTab =
  | "overview"
  | "content"
  | "worlds"
  | "servers"
  | "server"
  | "configs"
  | "settings"
  | "statistics"
  | "logs";

export type ProfileTab =
  | "profile"
  | "skins"
  | "achievements"
  | "leaderboard"
  | "modpacks";

export type PeopleSection = "friends" | "groups" | "requests";

export type Route =
  | { name: "home" }
  | { name: "instance"; id: string; tab?: InstanceTab }
  | {
      name: "instance-new";
      importPath?: string;
      shareCode?: string;
      modpackId?: string;
    }
  | { name: "people"; section?: PeopleSection; peerId?: string }
  | { name: "news" }
  | { name: "agent"; chatId?: string }
  | { name: "profile"; userId: string; tab?: ProfileTab }
  | { name: "accounts" }
  | { name: "settings"; section?: string };

export type RouteName = Route["name"];

export function routeKey(route: Route): string {
  switch (route.name) {
    case "instance":
      return route.tab ? `instance:${route.id}:${route.tab}` : `instance:${route.id}`;
    case "instance-new":
      return [
        "instance-new",
        route.importPath ?? "",
        route.shareCode ?? "",
        route.modpackId ?? "",
      ].join(":");
    case "people":
      return ["people", route.section ?? "", route.peerId ?? ""].join(":");
    case "profile":
      return route.tab
        ? `profile:${route.userId}:${route.tab}`
        : `profile:${route.userId}`;
    case "settings":
      return route.section ? `settings:${route.section}` : "settings";
    case "agent":
      return route.chatId ? `agent:${route.chatId}` : "agent";
    default:
      return route.name;
  }
}

export function isSameRoute(a: Route, b: Route): boolean {
  return routeKey(a) === routeKey(b);
}
