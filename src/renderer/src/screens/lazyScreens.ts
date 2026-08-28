import { lazyWithPreload } from "@renderer/utilities/lazyPreload";

export const LazyAgentScreen = lazyWithPreload(() =>
  import("./agent/AgentScreen").then((module) => ({
    default: module.AgentScreen,
  })),
);

export const LazyInstanceScreen = lazyWithPreload(() =>
  import("./instance/InstanceScreen").then((module) => ({
    default: module.InstanceScreen,
  })),
);

export const LazyNewInstanceScreen = lazyWithPreload(() =>
  import("./instanceNew/NewInstanceScreen").then((module) => ({
    default: module.NewInstanceScreen,
  })),
);

export const LazyNewsScreen = lazyWithPreload(() =>
  import("./news/NewsScreen").then((module) => ({
    default: module.NewsScreen,
  })),
);

export const LazyPeopleScreen = lazyWithPreload(() =>
  import("./people/PeopleScreen").then((module) => ({
    default: module.PeopleScreen,
  })),
);

export const LazySettingsScreen = lazyWithPreload(() =>
  import("./settings/SettingsScreen").then((module) => ({
    default: module.SettingsScreen,
  })),
);
