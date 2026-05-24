export interface ILauncherReleaseNote {
  version: string;
  title: string;
  subtitle: string;
  highlights: string[];
  fixes: string[];
  discordCta: string;
  discordUrl: string;
  publishedAt: string | null;
}
