export interface ILauncherReleaseNote {
  version: string;
  title: string;
  subtitle: string;
  highlights: string[];
  fixes: string[];
  discordCta: string;
  discordUrl: string;
  isMilestone: boolean;
  publishedAt: string | null;
}

export interface ILauncherReleasePage {
  generatedAt: string;
  total: number;
  offset: number;
  items: ILauncherReleaseNote[];
}
