import { app } from "electron";

export function getSystemLocale(): string {
  return app.getPreferredSystemLanguages()[0] || app.getLocale();
}
