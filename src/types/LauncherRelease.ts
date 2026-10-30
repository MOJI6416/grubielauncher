export interface ILauncherReleaseCover {
  url: string;
  ogUrl: string;
}

export interface ILauncherReleaseNote {
  version: string;
  title: string;
  subtitle: string;
  highlights: string[];
  fixes: string[];
  discordCta: string;
  discordUrl: string;
  isMilestone: boolean;
  cover?: ILauncherReleaseCover | null;
  publishedAt: string | null;
}

export interface ILauncherReleasePage {
  generatedAt: string;
  total: number;
  offset: number;
  items: ILauncherReleaseNote[];
}
